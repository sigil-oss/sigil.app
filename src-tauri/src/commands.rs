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
pub fn get_seconds_until_lock(state: State<'_, AutoLockState>) -> Option<u64> {
    state.seconds_until_lock()
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

fn is_private_host(host: &str) -> bool {
    matches!(host, "localhost" | "::1")
        || host.starts_with("127.")
        || host.starts_with("10.")
        || host.starts_with("169.254.")
        || host.starts_with("192.168.")
        || host.starts_with("172.")
            && host
                .split('.')
                .nth(1)
                .and_then(|s| s.parse::<u8>().ok())
                .map(|n| (16..=31).contains(&n))
                .unwrap_or(false)
}

#[tauri::command]
pub async fn post_callback(url: String, body: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "invalid callback URL".to_string())?;

    if parsed.scheme() != "https" {
        return Err("callback URL must use HTTPS".into());
    }
    let host = parsed.host_str().ok_or("callback URL has no host")?;
    if is_private_host(host) {
        return Err("callback URL must not target a private or loopback address".into());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    client
        .post(parsed)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
