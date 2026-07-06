use chrono::NaiveDateTime;
use slate_lib::daily_log_reminders::{
    build_evening_checkin_message, upcoming_daily_log_reminders, EVENING_LOG_REMINDER_ID,
    EVENING_LOG_TITLE,
};
use slate_lib::logic::{upcoming_evening_log_reminders_at, upcoming_water_reminders};
use slate_lib::models::{
    DailyLog, HabitEntry, HabitStatus, ReminderPreferences, TodayState,
};

#[test]
fn evening_log_reminder_schedule_includes_ten_pm() {
    let now = NaiveDateTime::parse_from_str("2026-07-02 09:00:00", "%Y-%m-%d %H:%M:%S").unwrap();
    let fires = upcoming_evening_log_reminders_at(now, 2, 22, 0);
    assert!(fires
        .iter()
        .any(|fire| fire.to_string().ends_with("22:00:00")));

    let preferences = ReminderPreferences::default();
    let payloads = upcoming_daily_log_reminders(now, &preferences);
    let evening = payloads
        .iter()
        .find(|payload| payload.routine_id == EVENING_LOG_REMINDER_ID)
        .expect("evening payload");
    assert_eq!(evening.title, EVENING_LOG_TITLE);
    assert_eq!(evening.fire_at, "2026-07-02 22:00:00");
}

#[test]
fn water_reminders_fire_every_six_hours() {
    let now = NaiveDateTime::parse_from_str("2026-07-02 01:00:00", "%Y-%m-%d %H:%M:%S").unwrap();
    let fires = upcoming_water_reminders(now, 1);
    let labels: Vec<String> = fires.iter().map(|fire| fire.to_string()).collect();
    assert_eq!(
        labels,
        vec![
            "2026-07-02 06:00:00".to_string(),
            "2026-07-02 12:00:00".to_string(),
            "2026-07-02 18:00:00".to_string(),
        ]
    );
}

#[test]
fn evening_checkin_message_lists_pending_items() {
    let state = TodayState {
        date: "2026-07-02".into(),
        locked: false,
        entries: vec![HabitEntry {
            habit_id: "h1".into(),
            title: "Sugar".into(),
            color: "#fff".into(),
            status: HabitStatus::Pending,
        }],
        progress: 0.0,
        current_streak: 0,
        routines: vec![],
        daily_log: DailyLog::default(),
    };

    let (title, body) = build_evening_checkin_message(&state).expect("message");
    assert_eq!(title, EVENING_LOG_TITLE);
    assert!(body.contains("Sugar"));
    assert!(body.contains("Trading"));
}