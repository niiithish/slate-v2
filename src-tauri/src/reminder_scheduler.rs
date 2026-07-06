use chrono::Local;
use tauri::{AppHandle, Manager, Runtime};

use crate::db::{DatabaseState, DbResult};
use crate::logic::next_reminder_fire_with_offset;
use crate::models::ReminderPreferences;
use crate::reminders::{
    filtered_daily_log_reminders, resolve_daily_log_reminder, routine_notification_body,
    ReminderPayload,
};

#[cfg(not(mobile))]
use crate::reminders::send_notification;

type SchedulerMap = std::sync::Arc<tokio::sync::Mutex<std::collections::HashMap<String, tokio::task::JoinHandle<()>>>>;

pub fn scheduler_state<R: Runtime>(app: &AppHandle<R>) -> SchedulerMap {
    if let Some(state) = app.try_state::<SchedulerMap>() {
        return state.inner().clone();
    }
    let map = std::sync::Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()));
    app.manage(map.clone());
    map
}

pub async fn sync_scheduled_reminders<R: Runtime>(
    app: &AppHandle<R>,
    db: std::sync::Arc<DatabaseState>,
    user_id: &str,
    preferences: &ReminderPreferences,
) -> DbResult<Vec<ReminderPayload>> {
    #[cfg(mobile)]
    ensure_mobile_notifications_ready(app)?;

    let routines = db.list_routines(user_id).await?;
    let now = Local::now().naive_local();
    let offset_minutes = i64::from(preferences.routine_offset_minutes.max(0));

    #[cfg(not(mobile))]
    let tasks = scheduler_state(app);
    #[cfg(not(mobile))]
    {
        let mut handles = tasks.lock().await;
        for handle in handles.values() {
            handle.abort();
        }
        handles.clear();
    }

    #[cfg(mobile)]
    {
        let _ = app.notification().cancel_all();
    }

    let mut payloads = Vec::new();

    for routine in routines {
        if !routine.reminder_enabled {
            continue;
        }
        let schedule = routine
            .into_schedule()
            .map_err(|e| crate::db::DbError::InvalidInput(e))?;
        let Some(fire_at) = next_reminder_fire_with_offset(&schedule, now, offset_minutes) else {
            continue;
        };

        payloads.push(ReminderPayload {
            routine_id: schedule.id.clone(),
            title: schedule.title.clone(),
            fire_at: fire_at.format("%Y-%m-%d %H:%M:%S").to_string(),
        });

        #[cfg(not(mobile))]
        schedule_desktop_reminder(
            app,
            db.clone(),
            user_id,
            &schedule.id,
            &schedule.title,
            schedule.start_time,
            offset_minutes,
            fire_at,
            &tasks,
        )
        .await;

        #[cfg(mobile)]
        {
            let body = routine_notification_body(
                &schedule.title,
                &schedule.start_time,
                offset_minutes,
            );
            let key = format!("routine:{}:{}", schedule.id, fire_at.date());
            if let Err(error) = schedule_mobile_notification(
                app,
                &key,
                "Routine reminder",
                &body,
                fire_at,
            ) {
                tracing::error!("failed to schedule mobile routine reminder '{key}': {error}");
            }
        }
    }

    #[cfg(mobile)]
    let mobile_evening_body = true;
    #[cfg(not(mobile))]
    let mobile_evening_body = false;

    for candidate in filtered_daily_log_reminders(
        db.as_ref(),
        user_id,
        now,
        preferences,
        mobile_evening_body,
    )
    .await?
    {
        let fire_at = chrono::NaiveDateTime::parse_from_str(&candidate.fire_at, "%Y-%m-%d %H:%M:%S")
            .map_err(|_| {
                crate::db::DbError::InvalidInput("invalid daily log reminder time".into())
            })?;

        let Some((title, _body)) = resolve_daily_log_reminder(
            db.as_ref(),
            user_id,
            &candidate,
            now,
            mobile_evening_body,
        )
        .await
        else {
            continue;
        };

        payloads.push(ReminderPayload {
            routine_id: candidate.routine_id.clone(),
            title: title.clone(),
            fire_at: candidate.fire_at.clone(),
        });

        #[cfg(not(mobile))]
        schedule_desktop_daily_reminder(
            app,
            db.clone(),
            user_id,
            &candidate.routine_id,
            fire_at,
            &tasks,
        )
        .await;

        #[cfg(mobile)]
        {
            let key = format!(
                "daily:{}:{}",
                candidate.routine_id,
                fire_at.format("%Y-%m-%d %H:%M")
            );
            if let Err(error) =
                schedule_mobile_notification(app, &key, &title, &body, fire_at)
            {
                tracing::error!("failed to schedule mobile daily reminder '{key}': {error}");
            }
        }
    }

    Ok(payloads)
}

#[cfg(mobile)]
fn stable_notification_id(key: &str) -> i32 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in key.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    (hash & 0x7FFF_FFFF).max(1) as i32
}

#[cfg(mobile)]
fn ensure_mobile_notifications_ready<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(), crate::db::DbError> {
    use tauri::plugin::PermissionState;
    use tauri_plugin_notification::NotificationExt;
    use tauri_plugin_notification::models::{Channel, Importance, Visibility};

    let notifications = app.notification();
    if let Ok(state) = notifications.permission_state() {
        if state != PermissionState::Granted {
            let _ = notifications.request_permission();
            if let Ok(PermissionState::Denied) = notifications.permission_state() {
                tracing::warn!(
                    "notification permission denied; mobile reminders may not be scheduled"
                );
            }
        }
    }

    let channel = Channel::builder("slate-reminders", "Slate reminders")
        .description("Routine start alerts and evening habit check-ins")
        .importance(Importance::High)
        .visibility(Visibility::Public)
        .vibration(true)
        .build();
    let _ = notifications.create_channel(channel);

    Ok(())
}

#[cfg(mobile)]
fn schedule_mobile_notification<R: Runtime>(
    app: &AppHandle<R>,
    key: &str,
    title: &str,
    body: &str,
    fire_at: chrono::NaiveDateTime,
) -> Result<(), crate::db::DbError> {
    use tauri_plugin_notification::{NotificationExt, Schedule};
    use time::OffsetDateTime;

    let local = fire_at.and_local_timezone(Local).single().ok_or_else(|| {
        crate::db::DbError::InvalidInput("invalid schedule time".into())
    })?;
    let date = OffsetDateTime::from_unix_timestamp(local.timestamp()).map_err(|_| {
        crate::db::DbError::InvalidInput("invalid schedule timestamp".into())
    })?;

    app.notification()
        .builder()
        .id(stable_notification_id(key))
        .channel_id("slate-reminders")
        .title(title)
        .body(body)
        .auto_cancel()
        .schedule(Schedule::At {
            date,
            repeating: false,
            allow_while_idle: true,
        })
        .show()
        .map_err(|error| crate::db::DbError::InvalidInput(error.to_string()))?;

    tracing::info!("scheduled mobile notification '{key}' for {fire_at}");
    Ok(())
}

#[cfg(not(mobile))]
async fn schedule_desktop_reminder<R: Runtime>(
    app: &AppHandle<R>,
    db: std::sync::Arc<DatabaseState>,
    user_id: &str,
    routine_id: &str,
    title: &str,
    start_time: chrono::NaiveTime,
    offset_minutes: i64,
    fire_at: chrono::NaiveDateTime,
    tasks: &SchedulerMap,
) {
    let app_handle = app.clone();
    let db = db.clone();
    let user_id = user_id.to_string();
    let routine_id = routine_id.to_string();
    let title = title.to_string();
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
        let body = routine_notification_body(&title, &start_time, offset_minutes);
        let _ = send_notification(&app_handle, "Routine reminder", &body);
        let _ = db.record_reminder_fire(&user_id, &routine_id, &date).await;
    });
    tasks.lock().await.insert(key, handle);
}

#[cfg(not(mobile))]
async fn schedule_desktop_daily_reminder<R: Runtime>(
    app: &AppHandle<R>,
    db: std::sync::Arc<DatabaseState>,
    user_id: &str,
    reminder_id: &str,
    fire_at: chrono::NaiveDateTime,
    tasks: &SchedulerMap,
) {
    let app_handle = app.clone();
    let db = db.clone();
    let user_id = user_id.to_string();
    let reminder_id = reminder_id.to_string();
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

        let payload = ReminderPayload {
            routine_id: reminder_id.clone(),
            title: String::new(),
            fire_at: fire_at.format("%Y-%m-%d %H:%M:%S").to_string(),
        };
        let now = Local::now().naive_local();
        let Some((title, body)) =
            resolve_daily_log_reminder(&db, &user_id, &payload, now, false).await
        else {
            return;
        };

        let _ = send_notification(&app_handle, &title, &body);
        let _ = db.record_reminder_fire(&user_id, &reminder_id, &date).await;
    });
    tasks.lock().await.insert(key, handle);
}

async fn wait_until(target: chrono::NaiveDateTime) {
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