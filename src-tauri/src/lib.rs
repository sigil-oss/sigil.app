mod auto_lock;
mod biometric;
mod clipboard;
mod commands;
mod deep_link;

use auto_lock::AutoLockState;
use clipboard::ClipboardState;
use deep_link::DeepLinkState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // When a second instance is launched (e.g. user clicked a sigil:// link while
            // the app was already running), process any deep link URL in its args.
            for arg in args {
                deep_link::process_url(app, &arg);
            }
            // Bring the existing window to the front.
            if let Some(window) = app.get_webview_window("main") {
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
        .setup(|app| {
            deep_link::register_handler(&app.handle().clone());
            auto_lock::spawn_lock_watcher(app.handle().clone());
            clipboard::spawn_clipboard_watcher(app.handle().clone());
            Ok(())
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
            commands::post_callback,
            biometric::check_biometric_available,
            biometric::enable_biometric,
            biometric::biometric_unlock,
            biometric::disable_biometric,
        ])
        .run(tauri::generate_context!())
        .expect("error while running sigil");
}
