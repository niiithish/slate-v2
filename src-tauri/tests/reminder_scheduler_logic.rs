use chrono::{NaiveDate, NaiveTime, Weekday};
use slate_lib::logic::{is_reminder_due_now, next_reminder_fire, weekday_to_u8};
use slate_lib::models::RoutineSchedule;

#[test]
fn scheduler_waits_for_future_fire_not_immediate() {
    let routine = RoutineSchedule {
        id: "r1".into(),
        title: "Later".into(),
        days: vec![weekday_to_u8(Weekday::Thu)],
        start_time: NaiveTime::from_hms_opt(21, 0, 0).unwrap(),
        end_time: NaiveTime::from_hms_opt(22, 0, 0).unwrap(),
        reminder_enabled: true,
    };

    let now = NaiveDate::from_ymd_opt(2026, 7, 2)
        .unwrap()
        .and_hms_opt(12, 0, 0)
        .unwrap();

    assert!(!is_reminder_due_now(&routine, now, 5));
    let next = next_reminder_fire(&routine, now).unwrap();
    assert!(next > now);
    assert_eq!(next.time(), routine.start_time);
}
