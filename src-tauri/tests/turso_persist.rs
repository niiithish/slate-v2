use std::path::Path;
use std::sync::Arc;

use chrono::Utc;
use slate_lib::db::DatabaseState;
use slate_lib::models::{DailyLog, HabitStatus};
use uuid::Uuid;

fn load_env() {
    for path in [".env.local", "../.env.local", "../../.env.local"] {
        if Path::new(path).exists() {
            dotenvy::from_filename(path).ok();
            break;
        }
    }
}

#[tokio::test]
async fn turso_round_trip_routine_habit_and_daily_log() {
    load_env();
    let db = Arc::new(DatabaseState::connect().await.expect("connect to Turso"));

    let suffix = Uuid::new_v4().to_string();
    let email = format!("test-{suffix}@slate.local");
    let user = db
        .register(&email, "test-hash", "Test User")
        .await
        .expect("register user");

    let routine = db
        .create_routine(
            &user.id,
            "Morning Focus",
            &[0, 1, 2, 3, 4],
            "08:00",
            "10:00",
            "#3b82f6",
            true,
        )
        .await
        .expect("create routine");

    let habit = db
        .create_habit(&user.id, "Social scrolling", "#f43f5e")
        .await
        .expect("create habit");

    let date = Utc::now().date_naive().to_string();
    let state = db
        .set_habit_status(&user.id, &habit.id, &date, HabitStatus::Avoided)
        .await
        .expect("write daily log");

    assert_eq!(state.entries.len(), 1);
    assert_eq!(state.entries[0].habit_id, habit.id);
    assert_eq!(state.entries[0].status, HabitStatus::Avoided);

    let routines = db.list_routines(&user.id).await.expect("list routines");
    assert!(routines
        .iter()
        .any(|r| r.id == routine.id && r.title == "Morning Focus"));

    let reread = db
        .get_today_state(&user.id, &date)
        .await
        .expect("read today state");
    assert_eq!(reread.entries[0].status, HabitStatus::Avoided);
    assert!((reread.progress - 100.0).abs() < 0.001);
}

#[tokio::test]
async fn turso_round_trip_daily_log_fields() {
    load_env();
    let db = std::sync::Arc::new(DatabaseState::connect().await.expect("connect to Turso"));

    let suffix = Uuid::new_v4().to_string();
    let email = format!("dailylog-{suffix}@slate.local");
    let user = db
        .register(&email, "test-hash", "Daily Log Tester")
        .await
        .expect("register user");

    let date = Utc::now().date_naive().to_string();
    let log = DailyLog {
        trading_profit: Some(142.5),
        book_title: Some("The Intelligent Investor".into()),
        book_description: Some("Read chapter on margin of safety".into()),
        water_ml: Some(2800),
    };

    let written = db
        .upsert_daily_log(&user.id, &date, &log)
        .await
        .expect("upsert daily log");

    assert_eq!(written.daily_log, log);

    let reread = db
        .get_today_state(&user.id, &date)
        .await
        .expect("read today state");
    assert_eq!(reread.daily_log.trading_profit, Some(142.5));
    assert_eq!(
        reread.daily_log.book_title.as_deref(),
        Some("The Intelligent Investor")
    );
    assert_eq!(
        reread.daily_log.book_description.as_deref(),
        Some("Read chapter on margin of safety")
    );
    assert_eq!(reread.daily_log.water_ml, Some(2800));

    let habit = db
        .create_habit(&user.id, "Late night snacks", "#f43f5e")
        .await
        .expect("create habit for lock test");
    db.set_habit_status(&user.id, &habit.id, &date, HabitStatus::Avoided)
        .await
        .expect("complete habit before lock");
    db.lock_day(&user.id, &date).await.expect("lock day");
    let blocked = db
        .upsert_daily_log(
            &user.id,
            &date,
            &DailyLog {
                trading_profit: Some(0.0),
                ..DailyLog::default()
            },
        )
        .await
        .expect_err("locked day must reject daily log edits");
    assert!(matches!(blocked, slate_lib::db::DbError::DayLocked));
}
