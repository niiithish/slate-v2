use std::path::Path;
use std::sync::Arc;

use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, Utc};
use libsql::{Builder, Connection, Database};
use rand::RngCore;
use thiserror::Error;
use uuid::Uuid;

use crate::logic::{
    calculate_current_streak, calculate_habit_streaks, can_edit_day, heatmap_completion_rate,
    is_routine_active_today, progress_percentage, validate_daily_log_fields,
};
use crate::models::{
    DailyLog, DayLog, Habit, HabitEntry, HabitStatus, HabitStreak, HeatmapCell, Routine, Session,
    StatsState, TodayState, User,
};

struct HabitRecord {
    id: String,
    title: String,
    active: bool,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum DbError {
    #[error("database error: {0}")]
    Database(#[from] libsql::Error),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error("not found")]
    NotFound,
    #[error("day is locked")]
    DayLocked,
    #[error("environment error: {0}")]
    Env(String),
}

pub type DbResult<T> = Result<T, DbError>;

pub struct DatabaseState {
    db: Database,
}

impl DatabaseState {
    pub async fn connect() -> DbResult<Self> {
        load_env();
        let url =
            env_var("DATABASE_URL").ok_or_else(|| DbError::Env("DATABASE_URL missing".into()))?;
        let token = env_var("DATABASE_TOKEN")
            .ok_or_else(|| DbError::Env("DATABASE_TOKEN missing".into()))?;

        // Android has no native OS CA store; bundled webpki roots work on all platforms.
        let https = hyper_rustls::HttpsConnectorBuilder::new()
            .with_webpki_roots()
            .https_or_http()
            .enable_http1()
            .build();
        let db = Builder::new_remote(url, token)
            .connector(https)
            .build()
            .await?;
        let state = Self { db };
        state.migrate().await?;
        Ok(state)
    }

    fn connection(&self) -> DbResult<Connection> {
        Ok(self.db.connect()?)
    }

    async fn migrate(&self) -> DbResult<()> {
        let conn = self.connection()?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS routines (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                days TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                color TEXT NOT NULL,
                reminder_enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS habits (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                color TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS daily_entries (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                habit_id TEXT NOT NULL,
                date TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                UNIQUE(user_id, habit_id, date)
            );

            CREATE TABLE IF NOT EXISTS day_locks (
                user_id TEXT NOT NULL,
                date TEXT NOT NULL,
                locked_at TEXT NOT NULL,
                PRIMARY KEY (user_id, date)
            );

            CREATE TABLE IF NOT EXISTS reminder_fires (
                user_id TEXT NOT NULL,
                routine_id TEXT NOT NULL,
                date TEXT NOT NULL,
                fired_at TEXT NOT NULL,
                PRIMARY KEY (user_id, routine_id, date)
            );

            CREATE TABLE IF NOT EXISTS daily_logs (
                user_id TEXT NOT NULL,
                date TEXT NOT NULL,
                trading_profit REAL,
                book_title TEXT,
                book_description TEXT,
                water_ml INTEGER,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, date)
            );
            "#,
        )
        .await?;
        Ok(())
    }

    pub async fn health(&self) -> DbResult<bool> {
        let conn = self.connection()?;
        let mut rows = conn.query("SELECT 1", ()).await?;
        Ok(rows.next().await?.is_some())
    }

    pub async fn register(
        &self,
        email: &str,
        password_hash: &str,
        display_name: &str,
    ) -> DbResult<User> {
        let conn = self.connection()?;
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        if let Err(error) = conn
            .execute(
                "INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
                (id.as_str(), email, password_hash, display_name, created_at.as_str()),
            )
            .await
        {
            let message = error.to_string().to_lowercase();
            if message.contains("unique") || message.contains("constraint") {
                return Err(DbError::InvalidInput("email already registered".into()));
            }
            return Err(DbError::Database(error));
        }
        Ok(User {
            id,
            email: email.to_string(),
            display_name: display_name.to_string(),
        })
    }

    pub async fn find_user_by_email(&self, email: &str) -> DbResult<Option<(User, String)>> {
        let conn = self.connection()?;
        let mut rows = conn
            .query(
                "SELECT id, email, display_name, password_hash FROM users WHERE email = ?",
                [email],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            let user = User {
                id: row.get(0)?,
                email: row.get(1)?,
                display_name: row.get(2)?,
            };
            let hash: String = row.get(3)?;
            return Ok(Some((user, hash)));
        }
        Ok(None)
    }

    pub async fn create_session(&self, user: &User) -> DbResult<Session> {
        let conn = self.connection()?;
        let session_id = Uuid::new_v4().to_string();
        let token = generate_token();
        let created_at = Utc::now();
        let expires_at = created_at + Duration::days(30);
        conn.execute(
            "INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
            (
                session_id.as_str(),
                user.id.as_str(),
                token.as_str(),
                expires_at.to_rfc3339().as_str(),
                created_at.to_rfc3339().as_str(),
            ),
        )
        .await?;
        Ok(Session {
            token,
            user: user.clone(),
        })
    }

    pub async fn resolve_session(&self, token: &str) -> DbResult<User> {
        let conn = self.connection()?;
        let mut rows = conn
            .query(
                "SELECT u.id, u.email, u.display_name, s.expires_at
                 FROM sessions s
                 JOIN users u ON u.id = s.user_id
                 WHERE s.token = ?",
                [token],
            )
            .await?;
        let Some(row) = rows.next().await? else {
            return Err(DbError::Unauthorized);
        };
        let expires_at: String = row.get(3)?;
        let expires = chrono::DateTime::parse_from_rfc3339(&expires_at)
            .map_err(|_| DbError::InvalidInput("invalid session expiry".into()))?;
        if expires < Utc::now() {
            let _ = conn
                .execute("DELETE FROM sessions WHERE token = ?", [token])
                .await;
            return Err(DbError::Unauthorized);
        }
        Ok(User {
            id: row.get(0)?,
            email: row.get(1)?,
            display_name: row.get(2)?,
        })
    }

    pub async fn delete_session(&self, token: &str) -> DbResult<()> {
        let conn = self.connection()?;
        conn.execute("DELETE FROM sessions WHERE token = ?", [token])
            .await?;
        Ok(())
    }

    pub async fn list_routines(&self, user_id: &str) -> DbResult<Vec<Routine>> {
        let conn = self.connection()?;
        let mut rows = conn
            .query(
                "SELECT id, title, days, start_time, end_time, color, reminder_enabled
                 FROM routines WHERE user_id = ? ORDER BY created_at DESC",
                [user_id],
            )
            .await?;
        let mut routines = Vec::new();
        while let Some(row) = rows.next().await? {
            let days_json: String = row.get(2)?;
            routines.push(Routine {
                id: row.get(0)?,
                title: row.get(1)?,
                days: serde_json::from_str(&days_json).unwrap_or_default(),
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                color: row.get(5)?,
                reminder_enabled: row.get::<i64>(6)? == 1,
            });
        }
        Ok(routines)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_routine(
        &self,
        user_id: &str,
        title: &str,
        days: &[u8],
        start_time: &str,
        end_time: &str,
        color: &str,
        reminder_enabled: bool,
    ) -> DbResult<Routine> {
        Routine::validate_fields(title, days, start_time, end_time)
            .map_err(DbError::InvalidInput)?;
        let conn = self.connection()?;
        let id = Uuid::new_v4().to_string();
        let days_json = serde_json::to_string(days)
            .map_err(|error| DbError::InvalidInput(error.to_string()))?;
        let created_at = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO routines (id, user_id, title, days, start_time, end_time, color, reminder_enabled, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                id.as_str(),
                user_id,
                title,
                days_json.as_str(),
                start_time,
                end_time,
                color,
                if reminder_enabled { 1 } else { 0 },
                created_at.as_str(),
            ),
        )
        .await?;
        Ok(Routine {
            id,
            title: title.to_string(),
            days: days.to_vec(),
            start_time: start_time.to_string(),
            end_time: end_time.to_string(),
            color: color.to_string(),
            reminder_enabled,
        })
    }

    pub async fn update_routine(&self, user_id: &str, routine: &Routine) -> DbResult<Routine> {
        Routine::validate_fields(
            &routine.title,
            &routine.days,
            &routine.start_time,
            &routine.end_time,
        )
        .map_err(DbError::InvalidInput)?;
        let conn = self.connection()?;
        let days_json = serde_json::to_string(&routine.days)
            .map_err(|error| DbError::InvalidInput(error.to_string()))?;
        let updated = conn
            .execute(
                "UPDATE routines SET title = ?, days = ?, start_time = ?, end_time = ?, color = ?, reminder_enabled = ?
                 WHERE id = ? AND user_id = ?",
                (
                    routine.title.as_str(),
                    days_json.as_str(),
                    routine.start_time.as_str(),
                    routine.end_time.as_str(),
                    routine.color.as_str(),
                    if routine.reminder_enabled { 1 } else { 0 },
                    routine.id.as_str(),
                    user_id,
                ),
            )
            .await?;
        if updated == 0 {
            return Err(DbError::NotFound);
        }
        Ok(routine.clone())
    }

    pub async fn delete_routine(&self, user_id: &str, routine_id: &str) -> DbResult<()> {
        let conn = self.connection()?;
        let deleted = conn
            .execute(
                "DELETE FROM routines WHERE id = ? AND user_id = ?",
                (routine_id, user_id),
            )
            .await?;
        if deleted == 0 {
            return Err(DbError::NotFound);
        }
        Ok(())
    }

    pub async fn list_habits(&self, user_id: &str) -> DbResult<Vec<Habit>> {
        let conn = self.connection()?;
        let mut rows = conn
            .query(
                "SELECT id, title, color, active FROM habits WHERE user_id = ? ORDER BY created_at ASC",
                [user_id],
            )
            .await?;
        let mut habits = Vec::new();
        while let Some(row) = rows.next().await? {
            habits.push(Habit {
                id: row.get(0)?,
                title: row.get(1)?,
                color: row.get(2)?,
                active: row.get::<i64>(3)? == 1,
            });
        }
        Ok(habits)
    }

    pub async fn create_habit(&self, user_id: &str, title: &str, color: &str) -> DbResult<Habit> {
        let conn = self.connection()?;
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO habits (id, user_id, title, color, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
            (id.as_str(), user_id, title, color, created_at.as_str()),
        )
        .await?;
        Ok(Habit {
            id,
            title: title.to_string(),
            color: color.to_string(),
            active: true,
        })
    }

    pub async fn update_habit(&self, user_id: &str, habit: &Habit) -> DbResult<Habit> {
        let conn = self.connection()?;
        let updated = conn
            .execute(
                "UPDATE habits SET title = ?, color = ?, active = ? WHERE id = ? AND user_id = ?",
                (
                    habit.title.as_str(),
                    habit.color.as_str(),
                    if habit.active { 1 } else { 0 },
                    habit.id.as_str(),
                    user_id,
                ),
            )
            .await?;
        if updated == 0 {
            return Err(DbError::NotFound);
        }
        Ok(habit.clone())
    }

    pub async fn delete_habit(&self, user_id: &str, habit_id: &str) -> DbResult<()> {
        let conn = self.connection()?;
        conn.execute(
            "DELETE FROM daily_entries WHERE habit_id = ? AND user_id = ?",
            (habit_id, user_id),
        )
        .await?;
        let deleted = conn
            .execute(
                "DELETE FROM habits WHERE id = ? AND user_id = ?",
                (habit_id, user_id),
            )
            .await?;
        if deleted == 0 {
            return Err(DbError::NotFound);
        }
        Ok(())
    }

    pub async fn get_today_state(&self, user_id: &str, date: &str) -> DbResult<TodayState> {
        let conn = self.connection()?;
        let habits = self.list_habits(user_id).await?;
        let active_habits: Vec<_> = habits.into_iter().filter(|h| h.active).collect();
        let date_naive = NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|_| DbError::InvalidInput("invalid date".into()))?;
        let routines = self
            .list_routines(user_id)
            .await?
            .into_iter()
            .filter(|routine| is_routine_active_today(&routine.days, date_naive.weekday()))
            .collect();
        let locked = self.is_day_locked(user_id, date).await?;

        let mut entries = Vec::new();
        for habit in &active_habits {
            let mut rows = conn
                .query(
                    "SELECT status FROM daily_entries WHERE user_id = ? AND habit_id = ? AND date = ?",
                    (user_id, habit.id.as_str(), date),
                )
                .await?;
            let status = if let Some(row) = rows.next().await? {
                HabitStatus::parse(&row.get::<String>(0)?)
            } else {
                HabitStatus::Pending
            };
            entries.push(HabitEntry {
                habit_id: habit.id.clone(),
                title: habit.title.clone(),
                color: habit.color.clone(),
                status,
            });
        }

        let logs = self.fetch_logs(user_id, 120).await?;
        let habit_records = self.fetch_habit_records(user_id).await?;
        let streak_habits: Vec<(String, NaiveDate)> = habit_records
            .iter()
            .filter(|habit| habit.active)
            .map(|habit| (habit.id.clone(), habit.created_at.date_naive()))
            .collect();
        let current_streak = calculate_current_streak(&logs, &streak_habits, date_naive);

        let daily_log = self.get_daily_log(user_id, date).await?;

        Ok(TodayState {
            date: date.to_string(),
            locked,
            progress: progress_percentage(&entries),
            entries,
            current_streak,
            routines,
            daily_log,
        })
    }

    pub async fn get_daily_log(&self, user_id: &str, date: &str) -> DbResult<DailyLog> {
        let conn = self.connection()?;
        let mut rows = conn
            .query(
                "SELECT trading_profit, book_title, book_description, water_ml
                 FROM daily_logs WHERE user_id = ? AND date = ?",
                (user_id, date),
            )
            .await?;
        if let Some(row) = rows.next().await? {
            let water_ml: Option<i64> = row.get(3)?;
            return Ok(DailyLog {
                trading_profit: row.get(0)?,
                book_title: row.get(1)?,
                book_description: row.get(2)?,
                water_ml: water_ml.map(|value| value as u32),
            });
        }
        Ok(DailyLog::default())
    }

    pub async fn upsert_daily_log(
        &self,
        user_id: &str,
        date: &str,
        daily_log: &DailyLog,
    ) -> DbResult<TodayState> {
        validate_daily_log_fields(
            &daily_log.book_title,
            &daily_log.book_description,
            &daily_log.water_ml,
        )
        .map_err(DbError::InvalidInput)?;

        let date_naive = NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|_| DbError::InvalidInput("invalid date".into()))?;
        let today = Local::now().date_naive();
        let locked = self.is_day_locked(user_id, date).await?;
        if !can_edit_day(locked, date_naive, today) {
            if locked {
                return Err(DbError::DayLocked);
            }
            return Err(DbError::InvalidInput("cannot edit future days".into()));
        }

        let conn = self.connection()?;
        let updated_at = Utc::now().to_rfc3339();
        let water_ml = daily_log.water_ml.map(|value| value as i64);
        conn.execute(
            "INSERT INTO daily_logs (user_id, date, trading_profit, book_title, book_description, water_ml, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, date) DO UPDATE SET
               trading_profit = excluded.trading_profit,
               book_title = excluded.book_title,
               book_description = excluded.book_description,
               water_ml = excluded.water_ml,
               updated_at = excluded.updated_at",
            (
                user_id,
                date,
                daily_log.trading_profit,
                daily_log.book_title.as_deref(),
                daily_log.book_description.as_deref(),
                water_ml,
                updated_at.as_str(),
            ),
        )
        .await?;
        self.get_today_state(user_id, date).await
    }

    pub async fn set_habit_status(
        &self,
        user_id: &str,
        habit_id: &str,
        date: &str,
        status: HabitStatus,
    ) -> DbResult<TodayState> {
        let date_naive = NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|_| DbError::InvalidInput("invalid date".into()))?;
        let today = Local::now().date_naive();
        let locked = self.is_day_locked(user_id, date).await?;
        if !can_edit_day(locked, date_naive, today) {
            if locked {
                return Err(DbError::DayLocked);
            }
            return Err(DbError::InvalidInput("cannot edit future days".into()));
        }
        let conn = self.connection()?;
        let mut owned = conn
            .query(
                "SELECT 1 FROM habits WHERE id = ? AND user_id = ? AND active = 1",
                (habit_id, user_id),
            )
            .await?;
        if owned.next().await?.is_none() {
            return Err(DbError::NotFound);
        }
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO daily_entries (id, user_id, habit_id, date, status)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(user_id, habit_id, date) DO UPDATE SET status = excluded.status",
            (id.as_str(), user_id, habit_id, date, status.as_str()),
        )
        .await?;
        self.get_today_state(user_id, date).await
    }

    pub async fn lock_day(&self, user_id: &str, date: &str) -> DbResult<TodayState> {
        let date_naive = NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|_| DbError::InvalidInput("invalid date".into()))?;
        let today = Local::now().date_naive();
        let locked = self.is_day_locked(user_id, date).await?;
        if !can_edit_day(locked, date_naive, today) {
            if locked {
                return Err(DbError::DayLocked);
            }
            return Err(DbError::InvalidInput("cannot lock future days".into()));
        }
        let state = self.get_today_state(user_id, date).await?;
        if state.entries.is_empty() {
            return Err(DbError::InvalidInput("add habits before locking".into()));
        }
        if state
            .entries
            .iter()
            .any(|e| e.status == HabitStatus::Pending)
        {
            return Err(DbError::InvalidInput(
                "complete all habits before locking".into(),
            ));
        }
        let conn = self.connection()?;
        let locked_at = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO day_locks (user_id, date, locked_at) VALUES (?, ?, ?)
             ON CONFLICT(user_id, date) DO UPDATE SET locked_at = excluded.locked_at",
            (user_id, date, locked_at.as_str()),
        )
        .await?;
        self.get_today_state(user_id, date).await
    }

    async fn is_day_locked(&self, user_id: &str, date: &str) -> DbResult<bool> {
        let conn = self.connection()?;
        let mut rows = conn
            .query(
                "SELECT 1 FROM day_locks WHERE user_id = ? AND date = ?",
                (user_id, date),
            )
            .await?;
        Ok(rows.next().await?.is_some())
    }

    async fn fetch_logs(&self, user_id: &str, days: i64) -> DbResult<Vec<DayLog>> {
        let conn = self.connection()?;
        let start = (Local::now().date_naive() - Duration::days(days)).to_string();
        let mut rows = conn
            .query(
                "SELECT date, habit_id, status FROM daily_entries
                 WHERE user_id = ? AND date >= ?",
                (user_id, start.as_str()),
            )
            .await?;
        let mut logs = Vec::new();
        while let Some(row) = rows.next().await? {
            let date_str: String = row.get(0)?;
            let date = chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                .map_err(|_| DbError::InvalidInput("invalid stored date".into()))?;
            logs.push(DayLog {
                date,
                habit_id: row.get(1)?,
                status: HabitStatus::parse(&row.get::<String>(2)?),
            });
        }
        Ok(logs)
    }

    async fn fetch_habit_records(&self, user_id: &str) -> DbResult<Vec<HabitRecord>> {
        let conn = self.connection()?;
        let mut rows = conn
            .query(
                "SELECT id, title, active, created_at FROM habits WHERE user_id = ? ORDER BY created_at ASC",
                [user_id],
            )
            .await?;
        let mut habits = Vec::new();
        while let Some(row) = rows.next().await? {
            let created_at: String = row.get(3)?;
            let created_at = DateTime::parse_from_rfc3339(&created_at)
                .map_err(|_| DbError::InvalidInput("invalid habit created_at".into()))?
                .with_timezone(&Utc);
            habits.push(HabitRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                active: row.get::<i64>(2)? == 1,
                created_at,
            });
        }
        Ok(habits)
    }

    /// Habits that existed on `date` (by `created_at`), including currently inactive ones.
    /// Historical stats should not rewrite the past when a habit is deactivated.
    fn habits_existing_on_date(records: &[HabitRecord], date: NaiveDate) -> Vec<&HabitRecord> {
        records
            .iter()
            .filter(|habit| habit.created_at.date_naive() <= date)
            .collect()
    }

    pub async fn reminder_already_fired(
        &self,
        user_id: &str,
        routine_id: &str,
        date: &str,
    ) -> DbResult<bool> {
        let conn = self.connection()?;
        let mut rows = conn
            .query(
                "SELECT 1 FROM reminder_fires WHERE user_id = ? AND routine_id = ? AND date = ?",
                (user_id, routine_id, date),
            )
            .await?;
        Ok(rows.next().await?.is_some())
    }

    /// Atomically claim a reminder fire slot. Returns `true` if this caller owns the fire.
    pub async fn claim_reminder_fire(
        &self,
        user_id: &str,
        routine_id: &str,
        date: &str,
    ) -> DbResult<bool> {
        let conn = self.connection()?;
        let fired_at = Utc::now().to_rfc3339();
        let inserted = conn
            .execute(
                "INSERT INTO reminder_fires (user_id, routine_id, date, fired_at) VALUES (?, ?, ?, ?)
                 ON CONFLICT(user_id, routine_id, date) DO NOTHING",
                (user_id, routine_id, date, fired_at.as_str()),
            )
            .await?;
        Ok(inserted > 0)
    }

    pub async fn release_reminder_fire(
        &self,
        user_id: &str,
        routine_id: &str,
        date: &str,
    ) -> DbResult<()> {
        let conn = self.connection()?;
        conn.execute(
            "DELETE FROM reminder_fires WHERE user_id = ? AND routine_id = ? AND date = ?",
            (user_id, routine_id, date),
        )
        .await?;
        Ok(())
    }

    pub async fn record_reminder_fire(
        &self,
        user_id: &str,
        routine_id: &str,
        date: &str,
    ) -> DbResult<()> {
        let _ = self.claim_reminder_fire(user_id, routine_id, date).await?;
        Ok(())
    }

    pub async fn get_stats(&self, user_id: &str, weeks: u32) -> DbResult<StatsState> {
        let days = (weeks.max(1) * 7) as i64;
        let logs = self.fetch_logs(user_id, days).await?;
        let habit_records = self.fetch_habit_records(user_id).await?;
        let today = Local::now().date_naive();

        let mut heatmap = Vec::new();
        for offset in 0..days {
            let date = today - Duration::days(days - 1 - offset);
            let date_str = date.to_string();
            let day_logs: Vec<_> = logs.iter().filter(|l| l.date == date).collect();
            let existing_on_day = Self::habits_existing_on_date(&habit_records, date);
            let existing_ids: std::collections::HashSet<_> = existing_on_day
                .iter()
                .map(|habit| habit.id.as_str())
                .collect();
            let avoided = day_logs
                .iter()
                .filter(|l| {
                    l.status == HabitStatus::Avoided && existing_ids.contains(l.habit_id.as_str())
                })
                .count() as u32;
            let slipped = day_logs
                .iter()
                .filter(|l| {
                    l.status == HabitStatus::Slipped && existing_ids.contains(l.habit_id.as_str())
                })
                .count() as u32;
            let total = existing_on_day.len() as u32;
            heatmap.push(HeatmapCell {
                date: date_str,
                avoided,
                slipped,
                total,
                completion_rate: heatmap_completion_rate(avoided, slipped, total),
            });
        }

        let habit_pairs: Vec<(String, String)> = habit_records
            .iter()
            .filter(|habit| habit.active)
            .map(|habit| (habit.id.clone(), habit.title.clone()))
            .collect();
        let streaks_raw = calculate_habit_streaks(&logs, &habit_pairs, today);
        let streaks = streaks_raw
            .into_iter()
            .map(|(habit_id, title, current, best)| HabitStreak {
                habit_id,
                title,
                current_streak: current,
                best_streak: best,
            })
            .collect();

        let total_avoided = logs
            .iter()
            .filter(|log| {
                log.status == HabitStatus::Avoided
                    && Self::habits_existing_on_date(&habit_records, log.date)
                        .iter()
                        .any(|habit| habit.id == log.habit_id)
            })
            .count() as u32;
        let total_slipped = logs
            .iter()
            .filter(|log| {
                log.status == HabitStatus::Slipped
                    && Self::habits_existing_on_date(&habit_records, log.date)
                        .iter()
                        .any(|habit| habit.id == log.habit_id)
            })
            .count() as u32;

        let conn = self.connection()?;
        let mut rows = conn
            .query(
                "SELECT COUNT(*) FROM day_locks WHERE user_id = ?",
                [user_id],
            )
            .await?;
        let days_locked = if let Some(row) = rows.next().await? {
            row.get::<i64>(0)? as u32
        } else {
            0
        };

        Ok(StatsState {
            heatmap,
            streaks,
            total_avoided,
            total_slipped,
            days_locked,
        })
    }
}

fn env_var(name: &str) -> Option<String> {
    std::env::var(name).ok().or_else(|| match name {
        "DATABASE_URL" => option_env!("DATABASE_URL").map(str::to_string),
        "DATABASE_TOKEN" => option_env!("DATABASE_TOKEN").map(str::to_string),
        _ => None,
    })
}

fn load_env() {
    if env_var("DATABASE_URL").is_some() && env_var("DATABASE_TOKEN").is_some() {
        return;
    }

    for path in [".env.local", "../.env.local", "../../.env.local"] {
        if Path::new(path).exists() {
            let _ = dotenvy::from_filename(path);
            return;
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        let path = format!("{home}/.config/com.nithish.slate/.env");
        if Path::new(&path).exists() {
            let _ = dotenvy::from_filename(&path);
        }
    }
}

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub type SharedDb = Arc<DatabaseState>;
