use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use reqwest;
use tauri::{AppHandle, Emitter, State};

pub struct HideToTrayState(pub AtomicBool);

impl Default for HideToTrayState {
    fn default() -> Self {
        HideToTrayState(AtomicBool::new(false))
    }
}

#[tauri::command]
pub fn set_hide_to_tray(state: State<'_, HideToTrayState>, enabled: bool) {
    state.0.store(enabled, Ordering::Relaxed);
}

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("failed to build HTTP client")
    })
}
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
pub fn force_lock(app: AppHandle, state: State<'_, AutoLockState>) {
    state.reset();
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
pub fn lock_clipboard(app: AppHandle, clip_state: State<'_, ClipboardState>) {
    if clip_state.has_pending_clear() {
        app.clipboard().write_text("").ok();
        clip_state.cancel_clear();
    }
}

pub fn is_private_host(host: &str) -> bool {
    // Strip IPv6 brackets so [fd00::1] → fd00::1
    let h = host.trim_matches(|c| c == '[' || c == ']').to_ascii_lowercase();
    if matches!(h.as_str(), "localhost" | "::1") { return true; }
    if h.starts_with("127.") || h.starts_with("10.") || h.starts_with("169.254.") || h.starts_with("192.168.") { return true; }
    if let Some(rest) = h.strip_prefix("172.") {
        // unwrap_or(0) is safe: a non-numeric second octet is not a valid 172.16-31 address
        let octet: u8 = rest.split('.').next().and_then(|s| s.parse().ok()).unwrap_or(0);
        if (16..=31).contains(&octet) { return true; }
    }
    // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
    if h.starts_with("fc") || h.starts_with("fd") || h.starts_with("fe80") { return true; }
    false
}

const MAX_CALLBACK_BODY: usize = 4 * 1024; // 4 KB

#[tauri::command]
pub async fn post_callback(url: String, body: String) -> Result<(), String> {
    if body.len() > MAX_CALLBACK_BODY {
        return Err("callback body exceeds 4 KB limit".into());
    }

    let parsed = url::Url::parse(&url).map_err(|_| "invalid callback URL".to_string())?;
    let host = parsed.host_str().ok_or("callback URL has no host")?;

    let is_local = matches!(host, "localhost" | "127.0.0.1");
    if parsed.scheme() != "https" && !(parsed.scheme() == "http" && is_local) {
        return Err("callback URL must use HTTPS (or http://localhost / http://127.0.0.1 for local dev)".into());
    }
    if !is_local && is_private_host(host) {
        return Err("callback URL must not target a private or loopback address".into());
    }

    http_client()
        .post(parsed)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    Ok(())
}
