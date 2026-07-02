use std::sync::Arc;

use tauri::State;

use crate::auth::{login_user, register_user, resolve_user};
use crate::db::{DatabaseState, DbError};
use crate::models::{
    DailyLog, Habit, HabitStatus, HealthResponse, Routine, Session, StatsState, TodayState, User,
};
use crate::reminder_scheduler::sync_scheduled_reminders;
use crate::reminders::upcoming_reminders;

#[derive(Clone)]
pub struct AppState {
    pub db: Option<Arc<DatabaseState>>,
    pub db_error: Option<String>,
}

impl AppState {
    pub async fn try_connect() -> Self {
        match DatabaseState::connect().await {
            Ok(db) => Self {
                db: Some(Arc::new(db)),
                db_error: None,
            },
            Err(error) => Self {
                db: None,
                db_error: Some(error.to_string()),
            },
        }
    }

    fn require_db(&self) -> Result<&Arc<DatabaseState>, String> {
        self.db.as_ref().ok_or_else(|| {
            self.db_error
                .clone()
                .unwrap_or_else(|| "database unavailable".into())
        })
    }
}

fn map_error(error: DbError) -> String {
    error.to_string()
}

pub async fn health_check_cmd(state: &AppState) -> Result<HealthResponse, String> {
    let database = match state.require_db() {
        Ok(db) => db.health().await.unwrap_or(false),
        Err(_) => false,
    };
    Ok(HealthResponse {
        ok: state.db.is_some(),
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
    register_user(state.require_db()?, &email, &password, &display_name)
        .await
        .map_err(map_error)
}

pub async fn login_cmd(
    state: &AppState,
    email: String,
    password: String,
) -> Result<Session, String> {
    login_user(state.require_db()?, &email, &password)
        .await
        .map_err(map_error)
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
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    state
        .require_db()?
        .create_routine(
            &user.id,
            &title,
            &days,
            &start_time,
            &end_time,
            &color,
            reminder_enabled,
        )
        .await
        .map_err(map_error)
}

pub async fn create_habit_cmd(
    state: &AppState,
    token: String,
    title: String,
    color: String,
) -> Result<Habit, String> {
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    state
        .require_db()?
        .create_habit(&user.id, &title, &color)
        .await
        .map_err(map_error)
}

pub async fn set_habit_status_cmd(
    state: &AppState,
    token: String,
    habit_id: String,
    date: String,
    status: String,
) -> Result<TodayState, String> {
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    let status = HabitStatus::parse_set_status(&status).map_err(|e| e.to_string())?;
    state
        .require_db()?
        .set_habit_status(&user.id, &habit_id, &date, status)
        .await
        .map_err(map_error)
}

pub async fn lock_day_cmd(
    state: &AppState,
    token: String,
    date: String,
) -> Result<TodayState, String> {
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    state
        .require_db()?
        .lock_day(&user.id, &date)
        .await
        .map_err(map_error)
}

pub async fn update_daily_log_cmd(
    state: &AppState,
    token: String,
    date: String,
    daily_log: DailyLog,
) -> Result<TodayState, String> {
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    state
        .require_db()?
        .upsert_daily_log(&user.id, &date, &daily_log)
        .await
        .map_err(map_error)
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
        .require_db()?
        .delete_session(&token)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub async fn get_me(state: State<'_, AppState>, token: String) -> Result<User, String> {
    resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub async fn list_routines(
    state: State<'_, AppState>,
    token: String,
) -> Result<Vec<Routine>, String> {
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    state
        .require_db()?
        .list_routines(&user.id)
        .await
        .map_err(map_error)
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
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    state
        .require_db()?
        .update_routine(&user.id, &routine)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub async fn delete_routine(
    state: State<'_, AppState>,
    token: String,
    routine_id: String,
) -> Result<(), String> {
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    state
        .require_db()?
        .delete_routine(&user.id, &routine_id)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub async fn list_habits(state: State<'_, AppState>, token: String) -> Result<Vec<Habit>, String> {
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    state
        .require_db()?
        .list_habits(&user.id)
        .await
        .map_err(map_error)
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
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    state
        .require_db()?
        .update_habit(&user.id, &habit)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub async fn delete_habit(
    state: State<'_, AppState>,
    token: String,
    habit_id: String,
) -> Result<(), String> {
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    state
        .require_db()?
        .delete_habit(&user.id, &habit_id)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub async fn get_today_state(
    state: State<'_, AppState>,
    token: String,
    date: Option<String>,
) -> Result<TodayState, String> {
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    let date = date.unwrap_or_else(|| chrono::Local::now().date_naive().to_string());
    state
        .require_db()?
        .get_today_state(&user.id, &date)
        .await
        .map_err(map_error)
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
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    state
        .require_db()?
        .get_stats(&user.id, weeks.unwrap_or(12))
        .await
        .map_err(map_error)
}

#[tauri::command]
pub async fn get_reminder_schedule(
    state: State<'_, AppState>,
    token: String,
) -> Result<Vec<crate::reminders::ReminderPayload>, String> {
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    upcoming_reminders(state.require_db()?, &user.id)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub async fn sync_reminder_schedules(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    token: String,
) -> Result<Vec<crate::reminders::ReminderPayload>, String> {
    let user = resolve_user(state.require_db()?, &token)
        .await
        .map_err(map_error)?;
    let db = state.require_db()?.clone();
    sync_scheduled_reminders(&app, db, &user.id)
        .await
        .map_err(map_error)
}
