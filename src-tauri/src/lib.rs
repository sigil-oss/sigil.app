mod auto_lock;
mod biometric;
mod clipboard;
mod commands;
mod deep_link;
mod store_crypto;
mod vault_crypto;

use std::sync::atomic::Ordering;

use auto_lock::AutoLockState;
use clipboard::ClipboardState;
use commands::HideToTrayState;
use deep_link::DeepLinkState;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_clipboard_manager::ClipboardExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            for arg in args {
                deep_link::process_url(app, &arg);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .manage(AutoLockState::default())
        .manage(DeepLinkState::default())
        .manage(ClipboardState::default())
        .manage(HideToTrayState::default())
        .setup(|app| {
            deep_link::register_handler(&app.handle().clone());
            auto_lock::spawn_lock_watcher(app.handle().clone());
            clipboard::spawn_clipboard_watcher(app.handle().clone());

            let show_i = MenuItem::with_id(app, "show", "Open Sigil", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let hide = window
                    .app_handle()
                    .state::<HideToTrayState>()
                    .0
                    .load(Ordering::Relaxed);
                if hide {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    let app = window.app_handle();
                    let clipboard = app.state::<ClipboardState>();
                    if clipboard.has_pending_clear() {
                        let _ = app.clipboard().write_text("");
                        clipboard.cancel_clear();
                    }
                }
            } else if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                let clipboard = app.state::<ClipboardState>();
                if clipboard.has_pending_clear() {
                    let _ = app.clipboard().write_text("");
                    clipboard.cancel_clear();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::reset_activity_timer,
            commands::set_lock_timeout,
            commands::set_lock_on_sleep,
            commands::get_seconds_until_lock,
            commands::force_lock,
            commands::get_pending_request,
            commands::clear_pending_request,
            commands::copy_to_clipboard,
            commands::clear_clipboard,
            commands::lock_clipboard,
            commands::post_callback,
            commands::set_hide_to_tray,
            store_crypto::encrypt_store_value,
            store_crypto::decrypt_store_value,
            vault_crypto::encrypt_vault,
            vault_crypto::decrypt_vault,
            biometric::check_biometric_available,
            biometric::enable_biometric,
            biometric::biometric_unlock,
            biometric::disable_biometric,
        ])
        .run(tauri::generate_context!())
        .expect("error while running sigil");
}
