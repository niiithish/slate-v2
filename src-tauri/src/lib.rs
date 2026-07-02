mod auth;
pub mod commands;
pub mod db;
pub mod logic;
pub mod models;
pub mod reminders;
mod reminder_scheduler;
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
        if state.db.is_none() {
            tracing::error!(
                "Turso database unavailable: {}",
                state.db_error.as_deref().unwrap_or("unknown error")
            );
        }

        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_notification::init())
            .manage(state)
            .setup(|app| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_fullscreen(false);
                    let _ = window.unmaximize();
                    let _ = window.set_size(LogicalSize::new(360.0, 620.0));
                    let _ = window.set_min_size(Some(LogicalSize::new(320.0, 520.0)));
                    let _ = window.set_max_size(Some(LogicalSize::new(420.0, 680.0)));
                    let _ = window.center();
                }
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
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
                commands::get_stats,
                commands::get_reminder_schedule,
                commands::sync_reminder_schedules,
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    });
}