use chrono::{Local, NaiveDateTime, Timelike};

use crate::logic::{upcoming_evening_log_reminders, upcoming_water_reminders};
use crate::reminders::ReminderPayload;

pub const EVENING_LOG_REMINDER_ID: &str = "daily-log:evening";
pub const WATER_LOG_REMINDER_PREFIX: &str = "daily-log:water";

pub const EVENING_LOG_TITLE: &str = "Trading & reading log";
pub const EVENING_LOG_BODY: &str = "Log your trading results and reading for today";
pub const WATER_LOG_TITLE: &str = "Water tracker";
pub const WATER_LOG_BODY: &str = "Time to log how much water you've had";

pub fn upcoming_daily_log_reminders(now: NaiveDateTime) -> Vec<ReminderPayload> {
    let mut payloads = Vec::new();

    for fire_at in upcoming_evening_log_reminders(now, 3) {
        payloads.push(ReminderPayload {
            routine_id: EVENING_LOG_REMINDER_ID.to_string(),
            title: EVENING_LOG_TITLE.to_string(),
            fire_at: fire_at.format("%Y-%m-%d %H:%M:%S").to_string(),
        });
    }

    for fire_at in upcoming_water_reminders(now, 2) {
        payloads.push(ReminderPayload {
            routine_id: format!("{WATER_LOG_REMINDER_PREFIX}:{}", fire_at.hour()),
            title: WATER_LOG_TITLE.to_string(),
            fire_at: fire_at.format("%Y-%m-%d %H:%M:%S").to_string(),
        });
    }

    payloads
}

pub fn daily_log_reminder_body(reminder_id: &str) -> Option<(&'static str, &'static str)> {
    if reminder_id == EVENING_LOG_REMINDER_ID {
        return Some((EVENING_LOG_TITLE, EVENING_LOG_BODY));
    }
    if reminder_id.starts_with(WATER_LOG_REMINDER_PREFIX) {
        return Some((WATER_LOG_TITLE, WATER_LOG_BODY));
    }
    None
}

pub fn now_local() -> NaiveDateTime {
    Local::now().naive_local()
}
