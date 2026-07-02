use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    App, Manager,
};

#[cfg(not(target_os = "linux"))]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};

const TRAY_ID: &str = "slate-tray";

pub fn setup_desktop(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Show Slate", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit Slate", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("missing default window icon")?;

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Slate")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        });

    #[cfg(target_os = "linux")]
    {
        tray_builder = tray_builder.show_menu_on_left_click(true);
    }

    #[cfg(not(target_os = "linux"))]
    {
        tray_builder = tray_builder
            .show_menu_on_left_click(false)
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    show_main_window(tray.app_handle());
                }
            });
    }

    let _tray = tray_builder.build(app)?;

    if let Some(window) = app.get_webview_window("main") {
        let main_window = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = main_window.hide();
                api.prevent_close();
            }
        });

        if should_start_hidden() {
            let _ = window.hide();
        }
    }

    Ok(())
}

fn should_start_hidden() -> bool {
    std::env::args().any(|arg| arg == "--background")
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
