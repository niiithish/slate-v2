use chrono::NaiveDateTime;
use serde::Serialize;
use tauri_plugin_notification::NotificationExt;

use crate::daily_log_reminders::{
    build_evening_checkin_message, daily_log_reminder_body, upcoming_daily_log_reminders,
    EVENING_LOG_BODY, EVENING_LOG_REMINDER_ID, EVENING_LOG_TITLE, WATER_LOG_BODY,
    WATER_LOG_REMINDER_PREFIX, WATER_LOG_TITLE,
};
use crate::db::{DatabaseState, DbError};
use crate::logic::next_reminder_fire_with_offset;
use crate::models::ReminderPreferences;

pub const REMINDER_WINDOW_MINUTES: i64 = 5;

pub const NOTIFICATION_PERMISSION_DENIED_MESSAGE: &str = "Notification permission denied. Enable notifications for Slate in system settings, then open Settings → Notifications and tap a reminder option to refresh.";

#[derive(Debug, Clone, Serialize)]
pub struct ReminderPayload {
    pub routine_id: String,
    pub title: String,
    pub fire_at: String,
}

pub fn build_reminder_payload(
    routine: &crate::models::RoutineSchedule,
    now: chrono::NaiveDateTime,
    offset_minutes: i64,
) -> Option<ReminderPayload> {
    let fire_at = next_reminder_fire_with_offset(routine, now, offset_minutes)?;
    Some(ReminderPayload {
        routine_id: routine.id.clone(),
        title: routine.title.clone(),
        fire_at: fire_at.format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

pub async fn upcoming_reminders(
    db: &DatabaseState,
    user_id: &str,
    preferences: &ReminderPreferences,
) -> Result<Vec<ReminderPayload>, DbError> {
    let routines = db.list_routines(user_id).await?;
    let now = chrono::Local::now().naive_local();
    let offset_minutes = i64::from(preferences.routine_offset_minutes.max(0));
    let mut payloads = Vec::new();

    for routine in routines {
        let schedule = routine.into_schedule().map_err(DbError::InvalidInput)?;
        if let Some(payload) = build_reminder_payload(&schedule, now, offset_minutes) {
            payloads.push(payload);
        }
    }

    payloads.extend(
        filtered_daily_log_reminders(db, user_id, now, preferences, false).await?,
    );
    Ok(payloads)
}

pub fn routine_notification_body(
    title: &str,
    start_time: &chrono::NaiveTime,
    offset_minutes: i64,
) -> String {
    if offset_minutes <= 0 {
        return format!("{title} starts now");
    }
    format!(
        "{title} starts at {start_time} (in {offset_minutes} minutes)"
    )
}

pub async fn resolve_daily_log_reminder(
    db: &DatabaseState,
    user_id: &str,
    payload: &ReminderPayload,
    now: NaiveDateTime,
    mobile_evening_body: bool,
) -> Option<(String, String)> {
    let fire_at =
        NaiveDateTime::parse_from_str(&payload.fire_at, "%Y-%m-%d %H:%M:%S").ok()?;
    if fire_at.date() < now.date() {
        return None;
    }

    if payload.routine_id == EVENING_LOG_REMINDER_ID {
        if fire_at.date() > now.date() {
            return Some((
                EVENING_LOG_TITLE.to_string(),
                EVENING_LOG_BODY.to_string(),
            ));
        }
        let date = fire_at.date().to_string();
        let state = db.get_today_state(user_id, &date).await.ok()?;
        let (title, body) = build_evening_checkin_message(&state)?;
        if mobile_evening_body {
            return Some((title, EVENING_LOG_BODY.to_string()));
        }
        return Some((title, body));
    }

    if payload.routine_id.starts_with(WATER_LOG_REMINDER_PREFIX) {
        let date = fire_at.date().to_string();
        let state = db.get_today_state(user_id, &date).await.ok()?;
        if state.daily_log.water_ml.is_some() {
            return None;
        }
        return Some((WATER_LOG_TITLE.to_string(), WATER_LOG_BODY.to_string()));
    }

    daily_log_reminder_body(&payload.routine_id)
        .map(|(title, body)| (title.to_string(), body.to_string()))
}

pub async fn filtered_daily_log_reminders(
    db: &DatabaseState,
    user_id: &str,
    now: NaiveDateTime,
    preferences: &ReminderPreferences,
    mobile_evening_body: bool,
) -> Result<Vec<ReminderPayload>, DbError> {
    let mut payloads = Vec::new();
    for candidate in upcoming_daily_log_reminders(now, preferences) {
        let Some((title, _body)) =
            resolve_daily_log_reminder(db, user_id, &candidate, now, mobile_evening_body).await
        else {
            continue;
        };
        payloads.push(ReminderPayload {
            routine_id: candidate.routine_id,
            title,
            fire_at: candidate.fire_at,
        });
    }
    Ok(payloads)
}

pub fn send_notification<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    title: &str,
    body: &str,
) -> Result<(), tauri_plugin_notification::Error> {
    app.notification().builder().title(title).body(body).show()
}