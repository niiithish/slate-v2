use chrono::NaiveDateTime;
use slate_lib::daily_log_reminders::{
    upcoming_daily_log_reminders, EVENING_LOG_REMINDER_ID, EVENING_LOG_TITLE,
};
use slate_lib::logic::{upcoming_evening_log_reminders, upcoming_water_reminders};

#[test]
fn evening_log_reminder_schedule_includes_ten_pm() {
    let now = NaiveDateTime::parse_from_str("2026-07-02 09:00:00", "%Y-%m-%d %H:%M:%S").unwrap();
    let fires = upcoming_evening_log_reminders(now, 2);
    assert!(fires
        .iter()
        .any(|fire| fire.to_string().ends_with("22:00:00")));

    let payloads = upcoming_daily_log_reminders(now);
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
