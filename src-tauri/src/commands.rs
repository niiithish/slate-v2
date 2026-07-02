use std::future::Future;
use std::sync::Arc;

use tauri::State;
use tokio::sync::Mutex;

use crate::auth::{login_user, register_user, resolve_user};
use crate::db::{DatabaseState, DbError};
use crate::models::{
    DailyLog, Habit, HabitStatus, HealthResponse, Routine, Session, StatsState, TodayState, User,
};
use crate::reminder_scheduler::sync_scheduled_reminders;
use crate::reminders::upcoming_reminders;

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
    state
        .with_db({
            let email = email.clone();
            let password = password.clone();
            let display_name = display_name.clone();
            move |db| {
                let email = email.clone();
                let password = password.clone();
                let display_name = display_name.clone();
                async move { register_user(&db, &email, &password, &display_name).await }
            }
        })
        .await
}

pub async fn login_cmd(
    state: &AppState,
    email: String,
    password: String,
) -> Result<Session, String> {
    state
        .with_db({
            let email = email.clone();
            let password = password.clone();
            move |db| {
                let email = email.clone();
                let password = password.clone();
                async move { login_user(&db, &email, &password).await }
            }
        })
        .await
}

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
    state
        .with_db({
            let token = token.clone();
            let title = title.clone();
            let days = days.clone();
            let start_time = start_time.clone();
            let end_time = end_time.clone();
            let color = color.clone();
            move |db| {
                let token = token.clone();
                let title = title.clone();
                let days = days.clone();
                let start_time = start_time.clone();
                let end_time = end_time.clone();
                let color = color.clone();
                async move {
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
                }
            }
        })
        .await
}

pub async fn create_habit_cmd(
    state: &AppState,
    token: String,
    title: String,
    color: String,
) -> Result<Habit, String> {
    state
        .with_db({
            let token = token.clone();
            let title = title.clone();
            let color = color.clone();
            move |db| {
                let token = token.clone();
                let title = title.clone();
                let color = color.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    db.create_habit(&user.id, &title, &color).await
                }
            }
        })
        .await
}

pub async fn set_habit_status_cmd(
    state: &AppState,
    token: String,
    habit_id: String,
    date: String,
    status: String,
) -> Result<TodayState, String> {
    let status = HabitStatus::parse_set_status(&status).map_err(|e| e.to_string())?;
    state
        .with_db({
            let token = token.clone();
            let habit_id = habit_id.clone();
            let date = date.clone();
            let status = status.clone();
            move |db| {
                let token = token.clone();
                let habit_id = habit_id.clone();
                let date = date.clone();
                let status = status.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    db.set_habit_status(&user.id, &habit_id, &date, status)
                        .await
                }
            }
        })
        .await
}

pub async fn lock_day_cmd(
    state: &AppState,
    token: String,
    date: String,
) -> Result<TodayState, String> {
    state
        .with_db({
            let token = token.clone();
            let date = date.clone();
            move |db| {
                let token = token.clone();
                let date = date.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    db.lock_day(&user.id, &date).await
                }
            }
        })
        .await
}

pub async fn update_daily_log_cmd(
    state: &AppState,
    token: String,
    date: String,
    daily_log: DailyLog,
) -> Result<TodayState, String> {
    state
        .with_db({
            let token = token.clone();
            let date = date.clone();
            let daily_log = daily_log.clone();
            move |db| {
                let token = token.clone();
                let date = date.clone();
                let daily_log = daily_log.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    db.upsert_daily_log(&user.id, &date, &daily_log).await
                }
            }
        })
        .await
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
    state
        .with_db({
            let token = token.clone();
            move |db| {
                let token = token.clone();
                async move { db.delete_session(&token).await }
            }
        })
        .await
}

#[tauri::command]
pub async fn get_me(state: State<'_, AppState>, token: String) -> Result<User, String> {
    state
        .with_db({
            let token = token.clone();
            move |db| {
                let token = token.clone();
                async move { resolve_user(&db, &token).await }
            }
        })
        .await
}

#[tauri::command]
pub async fn list_routines(
    state: State<'_, AppState>,
    token: String,
) -> Result<Vec<Routine>, String> {
    state
        .with_db({
            let token = token.clone();
            move |db| {
                let token = token.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    db.list_routines(&user.id).await
                }
            }
        })
        .await
}

#[tauri::command]
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
    state
        .with_db({
            let token = token.clone();
            let routine = routine.clone();
            move |db| {
                let token = token.clone();
                let routine = routine.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    db.update_routine(&user.id, &routine).await
                }
            }
        })
        .await
}

#[tauri::command]
pub async fn delete_routine(
    state: State<'_, AppState>,
    token: String,
    routine_id: String,
) -> Result<(), String> {
    state
        .with_db({
            let token = token.clone();
            let routine_id = routine_id.clone();
            move |db| {
                let token = token.clone();
                let routine_id = routine_id.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    db.delete_routine(&user.id, &routine_id).await
                }
            }
        })
        .await
}

#[tauri::command]
pub async fn list_habits(state: State<'_, AppState>, token: String) -> Result<Vec<Habit>, String> {
    state
        .with_db({
            let token = token.clone();
            move |db| {
                let token = token.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    db.list_habits(&user.id).await
                }
            }
        })
        .await
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
    state
        .with_db({
            let token = token.clone();
            let habit = habit.clone();
            move |db| {
                let token = token.clone();
                let habit = habit.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    db.update_habit(&user.id, &habit).await
                }
            }
        })
        .await
}

#[tauri::command]
pub async fn delete_habit(
    state: State<'_, AppState>,
    token: String,
    habit_id: String,
) -> Result<(), String> {
    state
        .with_db({
            let token = token.clone();
            let habit_id = habit_id.clone();
            move |db| {
                let token = token.clone();
                let habit_id = habit_id.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    db.delete_habit(&user.id, &habit_id).await
                }
            }
        })
        .await
}

#[tauri::command]
pub async fn get_today_state(
    state: State<'_, AppState>,
    token: String,
    date: Option<String>,
) -> Result<TodayState, String> {
    let date = date.unwrap_or_else(|| chrono::Local::now().date_naive().to_string());
    state
        .with_db({
            let token = token.clone();
            let date = date.clone();
            move |db| {
                let token = token.clone();
                let date = date.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    db.get_today_state(&user.id, &date).await
                }
            }
        })
        .await
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
    state
        .with_db({
            let token = token.clone();
            move |db| {
                let token = token.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    db.get_stats(&user.id, weeks.unwrap_or(12)).await
                }
            }
        })
        .await
}

#[tauri::command]
pub async fn get_reminder_schedule(
    state: State<'_, AppState>,
    token: String,
) -> Result<Vec<crate::reminders::ReminderPayload>, String> {
    state
        .with_db({
            let token = token.clone();
            move |db| {
                let token = token.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    upcoming_reminders(&db, &user.id).await
                }
            }
        })
        .await
}

#[tauri::command]
pub async fn sync_reminder_schedules(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    token: String,
) -> Result<Vec<crate::reminders::ReminderPayload>, String> {
    state
        .with_db({
            let token = token.clone();
            let app = app.clone();
            move |db| {
                let token = token.clone();
                let app = app.clone();
                async move {
                    let user = resolve_user(&db, &token).await?;
                    sync_scheduled_reminders(&app, db, &user.id).await
                }
            }
        })
        .await
}