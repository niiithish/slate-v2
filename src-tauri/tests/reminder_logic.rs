use chrono::{NaiveDate, NaiveTime, Weekday};
use slate_lib::logic::{is_reminder_due_now, next_reminder_fire, weekday_to_u8};
use slate_lib::models::RoutineSchedule;
use slate_lib::reminders::{build_reminder_payload, REMINDER_WINDOW_MINUTES};

#[test]
fn scheduler_enqueues_expected_timestamp() {
    let routine = RoutineSchedule {
        id: "routine-1".into(),
        title: "Evening wind-down".into(),
        days: vec![weekday_to_u8(Weekday::Thu)],
        start_time: NaiveTime::from_hms_opt(21, 0, 0).unwrap(),
        end_time: NaiveTime::from_hms_opt(22, 0, 0).unwrap(),
        reminder_enabled: true,
    };

    let now = NaiveDate::from_ymd_opt(2026, 7, 2)
        .unwrap()
        .and_hms_opt(12, 0, 0)
        .unwrap();

    let payload = build_reminder_payload(&routine, now).expect("payload");
    assert_eq!(payload.routine_id, "routine-1");
    assert_eq!(payload.fire_at, "2026-07-02 21:00:00");

    let next = next_reminder_fire(&routine, now).unwrap();
    assert_eq!(next.time(), routine.start_time);
}

#[test]
fn due_reminder_only_inside_start_window() {
    let routine = RoutineSchedule {
        id: "routine-2".into(),
        title: "Morning".into(),
        days: vec![weekday_to_u8(Weekday::Thu)],
        start_time: NaiveTime::from_hms_opt(8, 0, 0).unwrap(),
        end_time: NaiveTime::from_hms_opt(9, 0, 0).unwrap(),
        reminder_enabled: true,
    };

    let due = NaiveDate::from_ymd_opt(2026, 7, 2)
        .unwrap()
        .and_hms_opt(8, 2, 0)
        .unwrap();
    let before = NaiveDate::from_ymd_opt(2026, 7, 2)
        .unwrap()
        .and_hms_opt(7, 59, 0)
        .unwrap();

    assert!(is_reminder_due_now(&routine, due, REMINDER_WINDOW_MINUTES));
    assert!(!is_reminder_due_now(
        &routine,
        before,
        REMINDER_WINDOW_MINUTES
    ));
}
