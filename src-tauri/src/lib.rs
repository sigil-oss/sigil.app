mod auto_lock;
mod clipboard;
mod commands;
mod deep_link;

use auto_lock::AutoLockState;
use clipboard::ClipboardState;
use deep_link::DeepLinkState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running sigil");
}
