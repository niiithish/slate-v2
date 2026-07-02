use serde_json::{json, Value};
use slate_lib::commands::AppState;
use std::path::Path;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY,
};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};
use uuid::Uuid;

fn load_env() {
    for path in [".env.local", "../.env.local", "../../.env.local"] {
        if Path::new(path).exists() {
            dotenvy::from_filename(path).ok();
            break;
        }
    }
}

fn invoke(webview: &WebviewWindow<MockRuntime>, cmd: &str, args: Value) -> Result<Value, Value> {
    get_ipc_response(
        &webview,
        InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "tauri://localhost".parse().unwrap(),
            body: InvokeBody::Json(args),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|body| body.deserialize::<Value>().unwrap())
}

#[tokio::test]
async fn ipc_invoke_round_trip_with_camel_case_args() {
    load_env();
    let state = AppState::try_connect().await;
    assert!(state.has_db().await, "database should connect");

    let app = mock_builder()
        .manage(state)
        .invoke_handler(slate_lib::persist_invoke_handler!())
        .build(mock_context(noop_assets()))
        .expect("mock app");

    let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .expect("webview");

    let suffix = Uuid::new_v4().to_string();
    let email = format!("ipc-{suffix}@slate.local");
    let password = "test-password-123";

    let session = invoke(
        &webview,
        "register",
        json!({
            "email": email,
            "password": password,
            "displayName": "IPC Tester"
        }),
    )
    .expect("register invoke");
    let token = session["token"].as_str().expect("session token");

    let routine = invoke(
        &webview,
        "create_routine",
        json!({
            "token": token,
            "title": "Evening focus",
            "days": [0, 1, 2, 3, 4],
            "startTime": "18:00",
            "endTime": "20:00",
            "color": "#8b5cf6",
            "reminderEnabled": true
        }),
    )
    .expect("create_routine invoke with camelCase");

    assert_eq!(routine["title"], "Evening focus");
    assert_eq!(routine["color"], "#8b5cf6");
    assert_eq!(routine["start_time"], "18:00");

    let snake_case_fails = invoke(
        &webview,
        "create_routine",
        json!({
            "token": token,
            "title": "Broken casing",
            "days": [0],
            "start_time": "09:00",
            "end_time": "10:00",
            "color": "#000000",
            "reminder_enabled": true
        }),
    );
    assert!(
        snake_case_fails.is_err(),
        "snake_case args must fail Tauri IPC binding"
    );

    let habit = invoke(
        &webview,
        "create_habit",
        json!({
            "token": token,
            "title": "Doomscrolling",
            "color": "#ef4444"
        }),
    )
    .expect("create_habit invoke");

    let habit_id = habit["id"].as_str().expect("habit id");
    let date = chrono::Utc::now().date_naive().to_string();

    let marked = invoke(
        &webview,
        "set_habit_status",
        json!({
            "token": token,
            "habitId": habit_id,
            "date": date,
            "status": "avoided"
        }),
    )
    .expect("set_habit_status invoke");

    assert_eq!(marked["entries"][0]["status"], "avoided");
    assert!((marked["progress"].as_f64().unwrap() - 100.0).abs() < 0.001);

    let locked = invoke(
        &webview,
        "lock_day",
        json!({ "token": token, "date": date }),
    )
    .expect("lock_day invoke");
    assert_eq!(locked["locked"], true);

    let blocked = invoke(
        &webview,
        "set_habit_status",
        json!({
            "token": token,
            "habitId": habit_id,
            "date": date,
            "status": "slipped"
        }),
    )
    .expect_err("locked day must reject IPC edits");
    assert!(blocked.to_string().contains("locked") || blocked.to_string().contains("DayLocked"));
}
