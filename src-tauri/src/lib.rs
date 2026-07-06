pub mod android_install;
pub mod auth;
pub mod commands;
pub mod daily_log_reminders;
pub mod db;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop;
pub mod logic;
pub mod mobile_updates;
pub mod models;
mod reminder_scheduler;
pub mod reminders;
pub mod testing;

use commands::AppState;
use models::HealthResponse;
use tauri::{LogicalSize, Manager};

pub fn smoke_check() -> Result<HealthResponse, String> {
    tauri::async_runtime::block_on(async {
        let state = AppState::try_connect().await;
        commands::health_check_cmd(&state).await
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::async_runtime::block_on(async {
        let state = AppState::try_connect().await;
        if !state.has_db().await {
            tracing::error!(
                "Turso database unavailable: {}",
                state.db_error().await.as_deref().unwrap_or("unknown error")
            );
        }

        let mut builder = tauri::Builder::default()
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_notification::init())
            .manage(state);

        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        {
            builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
        }

        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        {
            builder = builder.plugin(
                tauri_plugin_autostart::Builder::new()
                    .arg("--background")
                    .build(),
            );
        }

        builder
            .setup(|_app| {
                #[cfg(not(mobile))]
                {
                    #[cfg(not(any(target_os = "android", target_os = "ios")))]
                    desktop::setup_desktop(_app)?;

                    if let Some(window) = _app.get_webview_window("main") {
                        let _ = window.set_fullscreen(false);
                        let _ = window.unmaximize();
                        let _ = window.set_resizable(false);
                        let _ = window.set_size(LogicalSize::new(360.0, 620.0));
                        let _ = window.center();
                    }
                }
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                commands::runtime_platform,
                mobile_updates::check_mobile_update,
                android_install::install_android_update,
                commands::health_check,
                commands::register,
                commands::login,
                commands::logout,
                commands::get_me,
                commands::list_routines,
                commands::create_routine,
                commands::update_routine,
                commands::delete_routine,
                commands::list_habits,
                commands::create_habit,
                commands::update_habit,
                commands::delete_habit,
                commands::get_today_state,
                commands::set_habit_status,
                commands::lock_day,
                commands::update_daily_log,
                commands::get_stats,
                commands::get_reminder_schedule,
                commands::sync_reminder_schedules,
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    });
}