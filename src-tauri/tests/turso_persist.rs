use std::path::Path;
use std::sync::Arc;

use chrono::Utc;
use slate_lib::db::DatabaseState;
use slate_lib::models::HabitStatus;
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
    let db = Arc::new(
        DatabaseState::connect()
            .await
            .expect("connect to Turso"),
    );

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
    assert!(routines.iter().any(|r| r.id == routine.id && r.title == "Morning Focus"));

    let reread = db
        .get_today_state(&user.id, &date)
        .await
        .expect("read today state");
    assert_eq!(reread.entries[0].status, HabitStatus::Avoided);
    assert!((reread.progress - 100.0).abs() < 0.001);
}