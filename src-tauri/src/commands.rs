use reqwest;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::auto_lock::AutoLockState;
use crate::clipboard::ClipboardState;
use crate::deep_link::DeepLinkState;

#[tauri::command]
pub fn reset_activity_timer(state: State<'_, AutoLockState>) {
    state.reset();
}

#[tauri::command]
pub fn set_lock_timeout(minutes: u64, state: State<'_, AutoLockState>) {
    state.set_timeout(minutes);
}

#[tauri::command]
pub fn set_lock_on_sleep(enabled: bool, state: State<'_, AutoLockState>) {
    state.set_lock_on_sleep(enabled);
}

#[tauri::command]
pub fn force_lock(app: AppHandle) {
    app.emit("sigil:lock", ()).ok();
}

#[tauri::command]
pub fn get_pending_request(state: State<'_, DeepLinkState>) -> Option<String> {
    state.peek()
}

#[tauri::command]
pub fn clear_pending_request(state: State<'_, DeepLinkState>) {
    state.take();
}

#[tauri::command]
pub fn copy_to_clipboard(
    text: String,
    clear_after_secs: u64,
    app: AppHandle,
    clip_state: State<'_, ClipboardState>,
) -> Result<(), String> {
    app.clipboard().write_text(&text).map_err(|e| e.to_string())?;
    clip_state.schedule_clear(clear_after_secs);
    Ok(())
}

#[tauri::command]
pub fn clear_clipboard(app: AppHandle, clip_state: State<'_, ClipboardState>) {
    app.clipboard().write_text("").ok();
    clip_state.cancel_clear();
}

#[tauri::command]
pub async fn post_callback(url: String, body: String) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
