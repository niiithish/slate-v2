use std::collections::HashMap;
use std::sync::Arc;

use chrono::{Local, NaiveDateTime};
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::daily_log_reminders::{daily_log_reminder_body, upcoming_daily_log_reminders};
use crate::db::{DatabaseState, DbResult};
use crate::logic::next_reminder_fire;

#[cfg(not(mobile))]
use crate::reminders::send_notification;
use crate::reminders::ReminderPayload;

type SchedulerMap = Arc<Mutex<HashMap<String, JoinHandle<()>>>>;

pub fn scheduler_state<R: Runtime>(app: &AppHandle<R>) -> SchedulerMap {
    if let Some(state) = app.try_state::<SchedulerMap>() {
        return state.inner().clone();
    }
    let map = Arc::new(Mutex::new(HashMap::new()));
    app.manage(map.clone());
    map
}

pub async fn sync_scheduled_reminders<R: Runtime>(
    app: &AppHandle<R>,
    db: Arc<DatabaseState>,
    user_id: &str,
) -> DbResult<Vec<ReminderPayload>> {
    let routines = db.list_routines(user_id).await?;
    let now = Local::now().naive_local();
    let tasks = scheduler_state(app);
    let mut handles = tasks.lock().await;
    for handle in handles.values() {
        handle.abort();
    }
    handles.clear();

    let mut payloads = Vec::new();
    for routine in routines {
        if !routine.reminder_enabled {
            continue;
        }
        let schedule = routine
            .into_schedule()
            .map_err(|e| crate::db::DbError::InvalidInput(e))?;
        let Some(fire_at) = next_reminder_fire(&schedule, now) else {
            continue;
        };
        payloads.push(ReminderPayload {
            routine_id: schedule.id.clone(),
            title: schedule.title.clone(),
            fire_at: fire_at.format("%Y-%m-%d %H:%M:%S").to_string(),
        });

        #[cfg(not(mobile))]
        {
            let app_handle = app.clone();
            let db = db.clone();
            let user_id = user_id.to_string();
            let routine_id = schedule.id.clone();
            let title = schedule.title.clone();
            let key = format!("{user_id}:{routine_id}:{}", fire_at.date());

            let handle = tokio::spawn(async move {
                wait_until(fire_at).await;
                let date = fire_at.date().to_string();
                let already_fired = match db
                    .reminder_already_fired(&user_id, &routine_id, &date)
                    .await
                {
                    Ok(value) => value,
                    Err(error) => {
                        tracing::error!("reminder dedup check failed: {error}");
                        return;
                    }
                };
                if already_fired {
                    return;
                }
                let _ = send_notification(
                    &app_handle,
                    "Routine reminder",
                    &format!("{title} starts now"),
                );
                let _ = db.record_reminder_fire(&user_id, &routine_id, &date).await;
            });
            handles.insert(key, handle);
        }

        #[cfg(mobile)]
        {
            let _ = schedule_mobile_notification(
                app,
                &schedule.title,
                &format!("{} starts at {}", schedule.title, schedule.start_time),
                fire_at,
            );
        }
    }

    for payload in upcoming_daily_log_reminders(now) {
        let fire_at = chrono::NaiveDateTime::parse_from_str(&payload.fire_at, "%Y-%m-%d %H:%M:%S")
            .map_err(|_| {
                crate::db::DbError::InvalidInput("invalid daily log reminder time".into())
            })?;
        payloads.push(payload.clone());

        let Some((title, body)) = daily_log_reminder_body(&payload.routine_id) else {
            continue;
        };

        #[cfg(not(mobile))]
        {
            let app_handle = app.clone();
            let db = db.clone();
            let user_id = user_id.to_string();
            let reminder_id = payload.routine_id.clone();
            let key = format!(
                "{user_id}:{reminder_id}:{}",
                fire_at.format("%Y-%m-%d %H:%M")
            );

            let handle = tokio::spawn(async move {
                wait_until(fire_at).await;
                let date = fire_at.date().to_string();
                let already_fired = match db
                    .reminder_already_fired(&user_id, &reminder_id, &date)
                    .await
                {
                    Ok(value) => value,
                    Err(error) => {
                        tracing::error!("daily log reminder dedup check failed: {error}");
                        return;
                    }
                };
                if already_fired {
                    return;
                }
                let _ = send_notification(&app_handle, title, body);
                let _ = db.record_reminder_fire(&user_id, &reminder_id, &date).await;
            });
            handles.insert(key, handle);
        }

        #[cfg(mobile)]
        {
            let _ = schedule_mobile_notification(app, title, body, fire_at);
        }
    }

    Ok(payloads)
}

async fn wait_until(target: NaiveDateTime) {
    loop {
        let now = Local::now().naive_local();
        let remaining = target.signed_duration_since(now);
        if remaining.num_milliseconds() <= 0 {
            break;
        }
        let millis = remaining.num_milliseconds().min(60_000) as u64;
        tokio::time::sleep(std::time::Duration::from_millis(millis.max(1))).await;
    }
}

#[cfg(mobile)]
fn schedule_mobile_notification<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
    body: &str,
    fire_at: NaiveDateTime,
) -> Result<(), tauri_plugin_notification::Error> {
    use tauri_plugin_notification::{NotificationExt, Schedule};
    use time::OffsetDateTime;

    let local = fire_at.and_local_timezone(Local).single().ok_or_else(|| {
        tauri_plugin_notification::Error::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "invalid schedule time",
        ))
    })?;
    let date = OffsetDateTime::from_unix_timestamp(local.timestamp()).map_err(|_| {
        tauri_plugin_notification::Error::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "invalid schedule timestamp",
        ))
    })?;

    app.notification()
        .builder()
        .title(title)
        .body(body)
        .schedule(Schedule::At {
            date,
            repeating: false,
            allow_while_idle: true,
        })
        .show()
}
