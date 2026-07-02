#[macro_export]
macro_rules! persist_invoke_handler {
    () => {
        tauri::generate_handler![
            $crate::commands::register,
            $crate::commands::create_routine,
            $crate::commands::create_habit,
            $crate::commands::set_habit_status,
            $crate::commands::lock_day,
            $crate::commands::get_today_state,
        ]
    };
}