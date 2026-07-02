use chrono::Local;
use serde::Serialize;
use tauri_plugin_notification::NotificationExt;

use crate::daily_log_reminders::upcoming_daily_log_reminders;
use crate::db::{DatabaseState, DbError, DbResult};
use crate::logic::next_reminder_fire;
use crate::models::RoutineSchedule;

pub const REMINDER_WINDOW_MINUTES: i64 = 5;

#[derive(Debug, Clone, Serialize)]
pub struct ReminderPayload {
    pub routine_id: String,
    pub title: String,
    pub fire_at: String,
}

pub fn build_reminder_payload(
    routine: &RoutineSchedule,
    now: chrono::NaiveDateTime,
) -> Option<ReminderPayload> {
    let fire_at = next_reminder_fire(routine, now)?;
    Some(ReminderPayload {
        routine_id: routine.id.clone(),
        title: routine.title.clone(),
        fire_at: fire_at.format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

pub async fn upcoming_reminders(
    db: &DatabaseState,
    user_id: &str,
) -> DbResult<Vec<ReminderPayload>> {
    let routines = db.list_routines(user_id).await?;
    let now = Local::now().naive_local();
    let mut payloads = Vec::new();

    for routine in routines {
        let schedule = routine
            .into_schedule()
            .map_err(|e| DbError::InvalidInput(e))?;
        if let Some(payload) = build_reminder_payload(&schedule, now) {
            payloads.push(payload);
        }
    }

    payloads.extend(upcoming_daily_log_reminders(now));
    Ok(payloads)
}

pub fn send_notification<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    title: &str,
    body: &str,
) -> Result<(), tauri_plugin_notification::Error> {
    app.notification().builder().title(title).body(body).show()
}
