use chrono::{Datelike, Local, Timelike};
use slate_lib::db::DatabaseState;
use slate_lib::logic::weekday_to_u8;

const USER_EMAIL: &str = "niiithish@gmail.com";

/// Manual harness: stages a "Notif test" routine ~2 minutes ahead on the
/// personal Turso account so a physical device can register the alarm.
/// Run with: `cargo test --test trigger_test_notification -- --ignored --nocapture`
#[tokio::test]
#[ignore = "manual: mutates live Turso user to stage a phone notification"]
async fn trigger_test_notification_now() {
    let db = DatabaseState::connect().await.expect("connect to Turso");
    let (user, _) = db
        .find_user_by_email(USER_EMAIL)
        .await
        .expect("lookup user")
        .expect("user should exist");

    let now = Local::now();
    let fire = now + chrono::Duration::minutes(2);
    let end = fire + chrono::Duration::minutes(5);
    let start_time = format!("{:02}:{:02}", fire.hour(), fire.minute());
    let end_time = format!("{:02}:{:02}", end.hour(), end.minute());
    let today = weekday_to_u8(now.weekday());

    let routines = db.list_routines(&user.id).await.expect("list routines");
    let test_title = "Notif test";

    let routine = if let Some(existing) = routines.iter().find(|r| r.title == test_title) {
        let mut updated = existing.clone();
        updated.start_time = start_time.clone();
        updated.end_time = end_time.clone();
        updated.days = vec![today];
        updated.reminder_enabled = true;
        db.update_routine(&user.id, &updated)
            .await
            .expect("update test routine")
    } else {
        db.create_routine(
            &user.id,
            test_title,
            &[today],
            &start_time,
            &end_time,
            "#6BDA0A",
            true,
        )
        .await
        .expect("create test routine")
    };

    println!(
        "Scheduled '{}' to start at {} (notification should fire ~2 min from now).",
        routine.title, routine.start_time
    );
    println!("Open Slate on your phone to register the alarm on-device.");
}
