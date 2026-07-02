// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::var("SLATE_SMOKE").is_ok() {
        match slate_lib::smoke_check() {
            Ok(payload) => {
                println!(
                    "{}",
                    serde_json::to_string(&payload).expect("serialize smoke payload")
                );
                std::process::exit(0);
            }
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
    }
    slate_lib::run()
}
