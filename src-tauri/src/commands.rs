use std::future::Future;
use std::sync::Arc;

use tauri::State;
use tokio::sync::Mutex;

use crate::auth::{login_user, register_user, resolve_user};
use crate::db::{DatabaseState, DbError};
use crate::models::{
    DailyLog, Habit, HabitStatus, HealthResponse, ReminderPreferences, Routine, Session,
    StatsState, TodayState, User,
};
use crate::reminder_scheduler::sync_scheduled_reminders;
use crate::reminders::upcoming_reminders;

macro_rules! with_db_cmd {
    ($state:expr, clone($($var:ident),*) |$db:ident| $($body:tt)*) => {
        $state
            .with_db(move |$db| {
                $( let $var = $var.clone(); )*
                async move { $($body)* }
            })
            .await
    };
    ($state:expr, |$db:ident| $($body:tt)*) => {
        $state
            .with_db(move |$db| async move { $($body)* })
            .await
    };
}

struct DbSlot {
    db: Option<Arc<DatabaseState>>,
    error: Option<String>,
}

impl DbSlot {
    async fn connect() -> Self {
        match DatabaseState::connect().await {
            Ok(db) => Self {
                db: Some(Arc::new(db)),
                error: None,
            },
            Err(error) => Self {
                db: None,
                error: Some(error.to_string()),
            },
        }
    }

    fn require_db(&self) -> Result<Arc<DatabaseState>, String> {
        self.db.clone().ok_or_else(|| {
            self.error
                .clone()
                .unwrap_or_else(|| "database unavailable".into())
        })
    }
}

#[derive(Clone)]
pub struct AppState {
    slot: Arc<Mutex<DbSlot>>,
}

impl AppState {
    pub async fn try_connect() -> Self {
        Self {
            slot: Arc::new(Mutex::new(DbSlot::connect().await)),
        }
    }

    pub async fn has_db(&self) -> bool {
        self.slot.lock().await.db.is_some()
    }

    pub async fn db_error(&self) -> Option<String> {
        self.slot.lock().await.error.clone()
    }

    async fn require_db(&self) -> Result<Arc<DatabaseState>, String> {
        self.slot.lock().await.require_db()
    }

    async fn reconnect(&self) -> Result<(), String> {
        let mut slot = self.slot.lock().await;
        *slot = DbSlot::connect().await;
        slot.require_db().map(|_| ())
    }

    pub async fn with_db<T, F, Fut>(&self, mut run: F) -> Result<T, String>
    where
        F: FnMut(Arc<DatabaseState>) -> Fut,
        Fut: Future<Output = Result<T, DbError>>,
    {
        let db = self.require_db().await?;
        match run(db.clone()).await {
            Ok(value) => Ok(value),
            Err(error) if is_transient_db_error(&error) => {
                self.reconnect().await?;
                run(self.require_db().await?)
                    .await
                    .map_err(map_error)
            }
            Err(error) => Err(map_error(error)),
        }
    }
}

fn map_error(error: DbError) -> String {
    error.to_string()
}

fn is_transient_db_error(error: &DbError) -> bool {
    let message = error.to_string().to_lowercase();
    message.contains("connection abort")
        || message.contains("connection error")
        || message.contains("connection reset")
        || message.contains("broken pipe")
        || message.contains("timed out")
        || message.contains("os error 103")
}

pub async fn health_check_cmd(state: &AppState) -> Result<HealthResponse, String> {
    let database = state
        .with_db(|db| async move { db.health().await })
        .await
        .unwrap_or(false);
    Ok(HealthResponse {
        ok: state.has_db().await,
        database,
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

pub async fn register_cmd(
    state: &AppState,
    email: String,
    password: String,
    display_name: String,
) -> Result<Session, String> {
    with_db_cmd!(state, clone(email, password, display_name) |db|
        register_user(&db, &email, &password, &display_name).await
    )
}

pub async fn login_cmd(
    state: &AppState,
    email: String,
    password: String,
) -> Result<Session, String> {
    with_db_cmd!(state, clone(email, password) |db| login_user(&db, &email, &password).await)
}

#[allow(clippy::too_many_arguments)]
pub async fn create_routine_cmd(
    state: &AppState,
    token: String,
    title: String,
    days: Vec<u8>,
    start_time: String,
    end_time: String,
    color: String,
    reminder_enabled: bool,
) -> Result<Routine, String> {
    with_db_cmd!(state, clone(token, title, days, start_time, end_time, color) |db| {
        let user = resolve_user(&db, &token).await?;
        db.create_routine(
            &user.id,
            &title,
            &days,
            &start_time,
            &end_time,
            &color,
            reminder_enabled,
        )
        .await
    })
}

pub async fn create_habit_cmd(
    state: &AppState,
    token: String,
    title: String,
    color: String,
) -> Result<Habit, String> {
    with_db_cmd!(state, clone(token, title, color) |db| {
        let user = resolve_user(&db, &token).await?;
        db.create_habit(&user.id, &title, &color).await
    })
}

pub async fn set_habit_status_cmd(
    state: &AppState,
    token: String,
    habit_id: String,
    date: String,
    status: String,
) -> Result<TodayState, String> {
    let status = HabitStatus::parse_set_status(&status).map_err(|e| e.to_string())?;
    with_db_cmd!(state, clone(token, habit_id, date, status) |db| {
        let user = resolve_user(&db, &token).await?;
        db.set_habit_status(&user.id, &habit_id, &date, status)
            .await
    })
}

pub async fn lock_day_cmd(
    state: &AppState,
    token: String,
    date: String,
) -> Result<TodayState, String> {
    with_db_cmd!(state, clone(token, date) |db| {
        let user = resolve_user(&db, &token).await?;
        db.lock_day(&user.id, &date).await
    })
}

pub async fn update_daily_log_cmd(
    state: &AppState,
    token: String,
    date: String,
    daily_log: DailyLog,
) -> Result<TodayState, String> {
    with_db_cmd!(state, clone(token, date, daily_log) |db| {
        let user = resolve_user(&db, &token).await?;
        db.upsert_daily_log(&user.id, &date, &daily_log).await
    })
}

#[tauri::command]
pub fn runtime_platform() -> String {
    if cfg!(target_os = "android") {
        return "android".into();
    }
    if cfg!(target_os = "ios") {
        return "ios".into();
    }
    if cfg!(target_os = "linux") {
        return "linux".into();
    }
    if cfg!(target_os = "macos") {
        return "darwin".into();
    }
    if cfg!(target_os = "windows") {
        return "windows".into();
    }
    std::env::consts::OS.to_string()
}

#[tauri::command]
pub async fn health_check(state: State<'_, AppState>) -> Result<HealthResponse, String> {
    health_check_cmd(state.inner()).await
}

#[tauri::command]
pub async fn register(
    state: State<'_, AppState>,
    email: String,
    password: String,
    display_name: String,
) -> Result<Session, String> {
    register_cmd(state.inner(), email, password, display_name).await
}

#[tauri::command]
pub async fn login(
    state: State<'_, AppState>,
    email: String,
    password: String,
) -> Result<Session, String> {
    login_cmd(state.inner(), email, password).await
}

#[tauri::command]
pub async fn logout(state: State<'_, AppState>, token: String) -> Result<(), String> {
    with_db_cmd!(state.inner(), clone(token) |db| db.delete_session(&token).await)
}

#[tauri::command]
pub async fn get_me(state: State<'_, AppState>, token: String) -> Result<User, String> {
    with_db_cmd!(state.inner(), clone(token) |db| resolve_user(&db, &token).await)
}

#[tauri::command]
pub async fn list_routines(
    state: State<'_, AppState>,
    token: String,
) -> Result<Vec<Routine>, String> {
    with_db_cmd!(state.inner(), clone(token) |db| {
        let user = resolve_user(&db, &token).await?;
        db.list_routines(&user.id).await
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn create_routine(
    state: State<'_, AppState>,
    token: String,
    title: String,
    days: Vec<u8>,
    start_time: String,
    end_time: String,
    color: String,
    reminder_enabled: bool,
) -> Result<Routine, String> {
    create_routine_cmd(
        state.inner(),
        token,
        title,
        days,
        start_time,
        end_time,
        color,
        reminder_enabled,
    )
    .await
}

#[tauri::command]
pub async fn update_routine(
    state: State<'_, AppState>,
    token: String,
    routine: Routine,
) -> Result<Routine, String> {
    with_db_cmd!(state.inner(), clone(token, routine) |db| {
        let user = resolve_user(&db, &token).await?;
        db.update_routine(&user.id, &routine).await
    })
}

#[tauri::command]
pub async fn delete_routine(
    state: State<'_, AppState>,
    token: String,
    routine_id: String,
) -> Result<(), String> {
    with_db_cmd!(state.inner(), clone(token, routine_id) |db| {
        let user = resolve_user(&db, &token).await?;
        db.delete_routine(&user.id, &routine_id).await
    })
}

#[tauri::command]
pub async fn list_habits(state: State<'_, AppState>, token: String) -> Result<Vec<Habit>, String> {
    with_db_cmd!(state.inner(), clone(token) |db| {
        let user = resolve_user(&db, &token).await?;
        db.list_habits(&user.id).await
    })
}

#[tauri::command]
pub async fn create_habit(
    state: State<'_, AppState>,
    token: String,
    title: String,
    color: String,
) -> Result<Habit, String> {
    create_habit_cmd(state.inner(), token, title, color).await
}

#[tauri::command]
pub async fn update_habit(
    state: State<'_, AppState>,
    token: String,
    habit: Habit,
) -> Result<Habit, String> {
    with_db_cmd!(state.inner(), clone(token, habit) |db| {
        let user = resolve_user(&db, &token).await?;
        db.update_habit(&user.id, &habit).await
    })
}

#[tauri::command]
pub async fn delete_habit(
    state: State<'_, AppState>,
    token: String,
    habit_id: String,
) -> Result<(), String> {
    with_db_cmd!(state.inner(), clone(token, habit_id) |db| {
        let user = resolve_user(&db, &token).await?;
        db.delete_habit(&user.id, &habit_id).await
    })
}

#[tauri::command]
pub async fn get_today_state(
    state: State<'_, AppState>,
    token: String,
    date: Option<String>,
) -> Result<TodayState, String> {
    let date = date.unwrap_or_else(|| chrono::Local::now().date_naive().to_string());
    with_db_cmd!(state.inner(), clone(token, date) |db| {
        let user = resolve_user(&db, &token).await?;
        db.get_today_state(&user.id, &date).await
    })
}

#[tauri::command]
pub async fn set_habit_status(
    state: State<'_, AppState>,
    token: String,
    habit_id: String,
    date: String,
    status: String,
) -> Result<TodayState, String> {
    set_habit_status_cmd(state.inner(), token, habit_id, date, status).await
}

#[tauri::command]
pub async fn lock_day(
    state: State<'_, AppState>,
    token: String,
    date: String,
) -> Result<TodayState, String> {
    lock_day_cmd(state.inner(), token, date).await
}

#[tauri::command]
pub async fn update_daily_log(
    state: State<'_, AppState>,
    token: String,
    date: String,
    daily_log: DailyLog,
) -> Result<TodayState, String> {
    update_daily_log_cmd(state.inner(), token, date, daily_log).await
}

#[tauri::command]
pub async fn get_stats(
    state: State<'_, AppState>,
    token: String,
    weeks: Option<u32>,
) -> Result<StatsState, String> {
    with_db_cmd!(state.inner(), clone(token) |db| {
        let user = resolve_user(&db, &token).await?;
        db.get_stats(&user.id, weeks.unwrap_or(12)).await
    })
}

#[tauri::command]
pub async fn get_reminder_schedule(
    state: State<'_, AppState>,
    token: String,
    preferences: Option<ReminderPreferences>,
) -> Result<Vec<crate::reminders::ReminderPayload>, String> {
    let preferences = preferences.unwrap_or_default().sanitized();
    with_db_cmd!(state.inner(), clone(token, preferences) |db| {
        let user = resolve_user(&db, &token).await?;
        upcoming_reminders(&db, &user.id, &preferences).await
    })
}

#[tauri::command]
pub async fn sync_reminder_schedules(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    token: String,
    preferences: Option<ReminderPreferences>,
) -> Result<Vec<crate::reminders::ReminderPayload>, String> {
    let preferences = preferences.unwrap_or_default().sanitized();
    with_db_cmd!(state.inner(), clone(app, token, preferences) |db| {
        let user = resolve_user(&db, &token).await?;
        sync_scheduled_reminders(&app, db, &user.id, &preferences).await
    })
}