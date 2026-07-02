use std::collections::HashSet;
use std::path::Path;

use slate_lib::auth::login_user;
use slate_lib::db::DatabaseState;
use slate_lib::models::DailyLog;

const USER_EMAIL: &str = "niiithish@gmail.com";

const ROUTINE_COLORS: [&str; 6] = [
    "#6BDA0A", "#3B82F6", "#A855F7", "#F59E0B", "#EC4899", "#14B8A6",
];

const EXPECTED_ROUTINES: [(&str, &str, &str, &[u8]); 10] = [
    ("Fresh up", "06:30", "07:00", &[0, 1, 2, 3, 4, 5, 6]),
    ("Gym", "07:00", "08:30", &[0, 1, 2, 3, 4, 5]),
    ("Shower + Breakfast", "08:30", "09:30", &[0, 1, 2, 3, 4, 5, 6]),
    ("Chill", "09:30", "09:45", &[0, 1, 2, 3, 4, 5, 6]),
    ("Meditation", "09:45", "10:00", &[0, 1, 2, 3, 4, 5, 6]),
    ("Chill", "18:30", "18:45", &[0, 1, 2, 3, 4, 5, 6]),
    ("Meditation", "18:45", "19:00", &[0, 1, 2, 3, 4, 5, 6]),
    ("Trading", "19:00", "20:30", &[0, 1, 2, 3, 4]),
    ("Dinner", "20:30", "21:00", &[0, 1, 2, 3, 4, 5, 6]),
    ("Read Book", "21:00", "22:00", &[0, 1, 2, 3, 4, 5, 6]),
];

fn load_env() {
    for path in [".env.local", "../.env.local", "../../.env.local"] {
        if Path::new(path).exists() {
            dotenvy::from_filename(path).ok();
            break;
        }
    }
}

fn routine_key(title: &str, start_time: &str) -> String {
    format!("{title}|{start_time}")
}

#[tokio::test]
#[ignore = "requires SEED_PASSWORD env var; run with --ignored"]
async fn seed_and_verify_user_routines() {
    load_env();
    let password = std::env::var("SEED_PASSWORD")
        .expect("SEED_PASSWORD env var required for seed verification");

    let db = DatabaseState::connect()
        .await
        .expect("connect to Turso");

    let session = login_user(&db, USER_EMAIL, &password)
        .await
        .expect("login as seed user");
    let user_id = &session.user.id;

    let existing = db.list_routines(user_id).await.expect("list routines");
    let existing_keys: HashSet<String> = existing
        .iter()
        .map(|routine| routine_key(&routine.title, &routine.start_time))
        .collect();

    for (index, (title, start, end, days)) in EXPECTED_ROUTINES.iter().enumerate() {
        let key = routine_key(title, start);
        if existing_keys.contains(&key) {
            continue;
        }
        db.create_routine(
            user_id,
            title,
            days,
            start,
            end,
            ROUTINE_COLORS[index % ROUTINE_COLORS.len()],
            true,
        )
        .await
        .unwrap_or_else(|error| panic!("create routine {title}: {error}"));
    }

    let habits = db.list_habits(user_id).await.expect("list habits");
    if !habits.iter().any(|habit| habit.title == "Junk food") {
        db.create_habit(user_id, "Junk food", "#EF4444")
            .await
            .expect("create junk food habit");
    }

    let routines = db.list_routines(user_id).await.expect("list routines after seed");
    assert_eq!(
        routines.len(),
        EXPECTED_ROUTINES.len(),
        "expected exactly {} routines, found {}",
        EXPECTED_ROUTINES.len(),
        routines.len()
    );

    for (title, start, end, days) in EXPECTED_ROUTINES {
        let matched = routines.iter().find(|routine| {
            routine.title == *title
                && routine.start_time == *start
                && routine.end_time == *end
                && routine.days == *days
        });
        assert!(
            matched.is_some(),
            "missing routine: {title} {start}-{end} days={days:?}"
        );
    }

    let habits = db.list_habits(user_id).await.expect("list habits after seed");
    assert!(
        habits.iter().any(|habit| habit.title == "Junk food" && habit.active),
        "junk food avoid habit must exist"
    );

    let date = chrono::Utc::now().date_naive().to_string();
    let today = db
        .get_today_state(user_id, &date)
        .await
        .expect("fetch today state");
    assert_eq!(today.daily_log, DailyLog::default());

    println!("SEED_VERIFY_OK user={USER_EMAIL} routines={} habits={}", routines.len(), habits.len());
    println!("DAILY_LOG_DEFAULT trading_profit={:?} book_title={:?} water_ml={:?}",
        today.daily_log.trading_profit,
        today.daily_log.book_title,
        today.daily_log.water_ml,
    );
}