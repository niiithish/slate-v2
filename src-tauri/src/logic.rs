use crate::models::{DayLog, HabitEntry, HabitStatus, RoutineSchedule};
use chrono::{Datelike, NaiveDate, NaiveDateTime, NaiveTime, Weekday};

pub fn progress_percentage(entries: &[HabitEntry]) -> f64 {
    if entries.is_empty() {
        return 0.0;
    }
    let completed = entries
        .iter()
        .filter(|entry| entry.status != HabitStatus::Pending)
        .count();
    (completed as f64 / entries.len() as f64) * 100.0
}

pub fn can_edit_day(locked: bool, date: NaiveDate, today: NaiveDate) -> bool {
    !locked && date <= today
}

pub fn weekday_to_u8(weekday: Weekday) -> u8 {
    match weekday {
        Weekday::Mon => 0,
        Weekday::Tue => 1,
        Weekday::Wed => 2,
        Weekday::Thu => 3,
        Weekday::Fri => 4,
        Weekday::Sat => 5,
        Weekday::Sun => 6,
    }
}

pub fn is_routine_active_today(days: &[u8], weekday: Weekday) -> bool {
    days.contains(&weekday_to_u8(weekday))
}

pub fn day_fully_avoided(logs: &[DayLog], date: NaiveDate, habit_ids: &[String]) -> bool {
    if habit_ids.is_empty() {
        return false;
    }
    habit_ids.iter().all(|habit_id| {
        logs.iter().any(|log| {
            log.date == date && log.habit_id == *habit_id && log.status == HabitStatus::Avoided
        })
    })
}

pub fn calculate_current_streak(logs: &[DayLog], habit_ids: &[String], today: NaiveDate) -> u32 {
    if habit_ids.is_empty() {
        return 0;
    }

    let mut day = today;
    if !day_fully_avoided(logs, day, habit_ids) {
        day = match day.pred_opt() {
            Some(previous) => previous,
            None => return 0,
        };
    }

    let mut count = 0u32;
    while day_fully_avoided(logs, day, habit_ids) {
        count += 1;
        day = match day.pred_opt() {
            Some(previous) => previous,
            None => break,
        };
    }
    count
}

pub fn calculate_habit_streaks(
    logs: &[DayLog],
    habits: &[(String, String)],
    today: NaiveDate,
) -> Vec<(String, String, u32, u32)> {
    habits
        .iter()
        .map(|(id, title)| {
            let habit_logs: Vec<DayLog> = logs
                .iter()
                .filter(|log| log.habit_id == *id)
                .cloned()
                .collect();

            let current = streak_for_habit(&habit_logs, id, today, HabitStatus::Avoided);
            let best = best_streak_for_habit(&habit_logs, id, HabitStatus::Avoided);
            (id.clone(), title.clone(), current, best)
        })
        .collect()
}

fn streak_for_habit(logs: &[DayLog], habit_id: &str, today: NaiveDate, target: HabitStatus) -> u32 {
    let mut count = 0u32;
    let mut day = today;

    if !has_status(logs, habit_id, day, &target) {
        if let Some(yesterday) = day.pred_opt() {
            day = yesterday;
        } else {
            return 0;
        }
    }

    while has_status(logs, habit_id, day, &target) {
        count += 1;
        day = match day.pred_opt() {
            Some(prev) => prev,
            None => break,
        };
    }
    count
}

fn best_streak_for_habit(logs: &[DayLog], habit_id: &str, target: HabitStatus) -> u32 {
    let mut dates: Vec<NaiveDate> = logs
        .iter()
        .filter(|log| log.habit_id == habit_id && log.status == target)
        .map(|log| log.date)
        .collect();
    dates.sort();
    dates.dedup();

    let mut best = 0u32;
    let mut current = 0u32;
    let mut prev: Option<NaiveDate> = None;

    for date in dates {
        if let Some(previous) = prev {
            if date == previous.succ_opt().unwrap_or(date) {
                current += 1;
            } else {
                current = 1;
            }
        } else {
            current = 1;
        }
        best = best.max(current);
        prev = Some(date);
    }
    best
}

fn has_status(logs: &[DayLog], habit_id: &str, date: NaiveDate, target: &HabitStatus) -> bool {
    logs.iter()
        .any(|log| log.habit_id == habit_id && log.date == date && log.status == *target)
}

pub fn is_reminder_due_now(
    routine: &RoutineSchedule,
    now: NaiveDateTime,
    window_minutes: i64,
) -> bool {
    if !routine.reminder_enabled {
        return false;
    }
    if !is_routine_active_today(&routine.days, now.weekday()) {
        return false;
    }
    let fire_at = NaiveDateTime::new(now.date(), routine.start_time);
    let elapsed = now.signed_duration_since(fire_at).num_minutes();
    elapsed >= 0 && elapsed < window_minutes
}

pub fn next_reminder_fire(routine: &RoutineSchedule, now: NaiveDateTime) -> Option<NaiveDateTime> {
    if !routine.reminder_enabled {
        return None;
    }

    let today = now.date();
    for offset in 0..8 {
        let date = today + chrono::Duration::days(offset);
        let weekday = date.weekday();
        if !is_routine_active_today(&routine.days, weekday) {
            continue;
        }
        let fire_at = NaiveDateTime::new(date, routine.start_time);
        if fire_at > now {
            return Some(fire_at);
        }
    }
    None
}

pub const MAX_BOOK_TITLE_LEN: usize = 200;
pub const MAX_BOOK_DESCRIPTION_LEN: usize = 2000;
pub const MAX_WATER_ML: u32 = 20_000;

pub fn validate_daily_log_fields(
    book_title: &Option<String>,
    book_description: &Option<String>,
    water_ml: &Option<u32>,
) -> Result<(), String> {
    if let Some(title) = book_title {
        if title.len() > MAX_BOOK_TITLE_LEN {
            return Err(format!(
                "book title must be at most {MAX_BOOK_TITLE_LEN} characters"
            ));
        }
    }
    if let Some(description) = book_description {
        if description.len() > MAX_BOOK_DESCRIPTION_LEN {
            return Err(format!(
                "book description must be at most {MAX_BOOK_DESCRIPTION_LEN} characters"
            ));
        }
    }
    if let Some(ml) = water_ml {
        if *ml > MAX_WATER_ML {
            return Err(format!("water intake must be at most {MAX_WATER_ML} ml"));
        }
    }
    Ok(())
}

pub const EVENING_LOG_REMINDER_HOUR: u32 = 22;
pub const WATER_REMINDER_INTERVAL_HOURS: u32 = 6;
pub const WATER_REMINDER_HOURS: [u32; 4] = [0, 6, 12, 18];

pub fn next_evening_log_reminder(now: NaiveDateTime) -> NaiveDateTime {
    let fire_time =
        NaiveTime::from_hms_opt(EVENING_LOG_REMINDER_HOUR, 0, 0).expect("valid evening time");
    let today = NaiveDateTime::new(now.date(), fire_time);
    if now < today {
        today
    } else {
        NaiveDateTime::new(now.date() + chrono::Duration::days(1), fire_time)
    }
}

pub fn upcoming_evening_log_reminders(now: NaiveDateTime, days: i64) -> Vec<NaiveDateTime> {
    let mut fires = Vec::new();
    let fire_time =
        NaiveTime::from_hms_opt(EVENING_LOG_REMINDER_HOUR, 0, 0).expect("valid evening time");
    for offset in 0..days {
        let date = now.date() + chrono::Duration::days(offset);
        let fire_at = NaiveDateTime::new(date, fire_time);
        if fire_at > now {
            fires.push(fire_at);
        }
    }
    fires
}

pub fn upcoming_water_reminders(now: NaiveDateTime, days: i64) -> Vec<NaiveDateTime> {
    let mut fires = Vec::new();
    for offset in 0..days {
        let date = now.date() + chrono::Duration::days(offset);
        for hour in WATER_REMINDER_HOURS {
            let Some(time) = NaiveTime::from_hms_opt(hour, 0, 0) else {
                continue;
            };
            let fire_at = NaiveDateTime::new(date, time);
            if fire_at > now {
                fires.push(fire_at);
            }
        }
    }
    fires.sort();
    fires
}

pub fn heatmap_completion_rate(avoided: u32, _slipped: u32, total: u32) -> f64 {
    if total == 0 {
        return 0.0;
    }
    avoided as f64 / total as f64 * 100.0
}

#[cfg(test)]
mod tests {
    use chrono::{NaiveDateTime, NaiveTime};

    use super::*;
    use crate::models::HabitEntry;

    fn date(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    fn log(day: &str, habit: &str, status: HabitStatus) -> DayLog {
        DayLog {
            date: date(day),
            habit_id: habit.to_string(),
            status,
        }
    }

    #[test]
    fn progress_percentage_from_entries() {
        let entries = vec![
            HabitEntry {
                habit_id: "a".into(),
                title: "A".into(),
                color: "#fff".into(),
                status: HabitStatus::Avoided,
            },
            HabitEntry {
                habit_id: "b".into(),
                title: "B".into(),
                color: "#fff".into(),
                status: HabitStatus::Pending,
            },
            HabitEntry {
                habit_id: "c".into(),
                title: "C".into(),
                color: "#fff".into(),
                status: HabitStatus::Slipped,
            },
        ];
        let pct = progress_percentage(&entries);
        assert!((pct - 66.66666666666666).abs() < 0.001);
    }

    #[test]
    fn lock_blocks_edits() {
        assert!(!can_edit_day(true, date("2026-07-01"), date("2026-07-02")));
        assert!(can_edit_day(false, date("2026-07-02"), date("2026-07-02")));
        assert!(!can_edit_day(false, date("2026-07-03"), date("2026-07-02")));
    }

    #[test]
    fn streak_counts_consecutive_avoided_days() {
        let logs = vec![
            log("2026-07-01", "h1", HabitStatus::Avoided),
            log("2026-07-02", "h1", HabitStatus::Avoided),
            log("2026-07-03", "h1", HabitStatus::Avoided),
            log("2026-07-01", "h2", HabitStatus::Avoided),
            log("2026-07-02", "h2", HabitStatus::Slipped),
            log("2026-07-03", "h2", HabitStatus::Avoided),
        ];
        let habits = vec!["h1".to_string(), "h2".to_string()];
        let streak = calculate_current_streak(&logs, &habits, date("2026-07-03"));
        assert_eq!(streak, 1);
    }

    #[test]
    fn reminder_due_only_inside_window() {
        let routine = RoutineSchedule {
            id: "r1".into(),
            title: "Morning".into(),
            days: vec![weekday_to_u8(Weekday::Wed)],
            start_time: NaiveTime::from_hms_opt(8, 30, 0).unwrap(),
            end_time: NaiveTime::from_hms_opt(9, 0, 0).unwrap(),
            reminder_enabled: true,
        };
        let due = NaiveDate::from_ymd_opt(2026, 7, 1)
            .unwrap()
            .and_hms_opt(8, 31, 0)
            .unwrap();
        let early = NaiveDate::from_ymd_opt(2026, 7, 1)
            .unwrap()
            .and_hms_opt(8, 29, 0)
            .unwrap();
        let late = NaiveDate::from_ymd_opt(2026, 7, 1)
            .unwrap()
            .and_hms_opt(8, 35, 0)
            .unwrap();
        assert!(is_reminder_due_now(&routine, due, 5));
        assert!(!is_reminder_due_now(&routine, early, 5));
        assert!(!is_reminder_due_now(&routine, late, 5));
    }

    #[test]
    fn daily_log_validation_rejects_oversized_fields() {
        let long_title = "x".repeat(MAX_BOOK_TITLE_LEN + 1);
        let err = validate_daily_log_fields(&Some(long_title), &None, &None).unwrap_err();
        assert!(err.contains("book title"));

        let long_desc = "x".repeat(MAX_BOOK_DESCRIPTION_LEN + 1);
        let err = validate_daily_log_fields(&None, &Some(long_desc), &None).unwrap_err();
        assert!(err.contains("book description"));

        let err = validate_daily_log_fields(&None, &None, &Some(MAX_WATER_ML + 1)).unwrap_err();
        assert!(err.contains("water intake"));
    }

    #[test]
    fn daily_log_validation_accepts_empty_and_valid_values() {
        assert!(validate_daily_log_fields(&None, &None, &None).is_ok());
        assert!(validate_daily_log_fields(
            &Some("Atomic Habits".into()),
            &Some("Chapter on cues".into()),
            &Some(2500),
        )
        .is_ok());
    }

    #[test]
    fn evening_log_reminder_fires_at_ten_pm() {
        let afternoon = NaiveDate::from_ymd_opt(2026, 7, 2)
            .unwrap()
            .and_hms_opt(15, 0, 0)
            .unwrap();
        let next = next_evening_log_reminder(afternoon);
        assert_eq!(next.to_string(), "2026-07-02 22:00:00");

        let late = NaiveDate::from_ymd_opt(2026, 7, 2)
            .unwrap()
            .and_hms_opt(22, 30, 0)
            .unwrap();
        let next = next_evening_log_reminder(late);
        assert_eq!(next.to_string(), "2026-07-03 22:00:00");
    }

    #[test]
    fn water_reminders_every_six_hours() {
        let morning =
            NaiveDateTime::parse_from_str("2026-07-02 07:30:00", "%Y-%m-%d %H:%M:%S").unwrap();
        let fires = upcoming_water_reminders(morning, 1);
        assert_eq!(
            fires
                .iter()
                .map(|fire| fire.to_string())
                .collect::<Vec<_>>(),
            vec![
                "2026-07-02 12:00:00".to_string(),
                "2026-07-02 18:00:00".to_string(),
            ]
        );
    }

    #[test]
    fn reminder_picks_next_active_window() {
        let routine = RoutineSchedule {
            id: "r1".into(),
            title: "Morning".into(),
            days: vec![weekday_to_u8(Weekday::Wed), weekday_to_u8(Weekday::Thu)],
            start_time: NaiveTime::from_hms_opt(8, 30, 0).unwrap(),
            end_time: NaiveTime::from_hms_opt(9, 0, 0).unwrap(),
            reminder_enabled: true,
        };
        let now = NaiveDate::from_ymd_opt(2026, 7, 1)
            .unwrap()
            .and_hms_opt(10, 0, 0)
            .unwrap();
        let next = next_reminder_fire(&routine, now).unwrap();
        assert_eq!(next.date(), date("2026-07-02"));
        assert_eq!(next.time(), routine.start_time);
    }
}
