use std::net::{IpAddr, Ipv6Addr, ToSocketAddrs};
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

use crate::auto_lock::{AutoLockState, MAX_LOCK_TIMEOUT_MINUTES};
use crate::clipboard::ClipboardState;
use crate::deep_link::DeepLinkState;

const MAX_CLIPBOARD_CLEAR_SECS: u64 = 300;

#[tauri::command]
pub fn reset_activity_timer(state: State<'_, AutoLockState>) {
    state.reset();
}

#[tauri::command]
pub fn set_lock_timeout(minutes: u64, state: State<'_, AutoLockState>) {
    state.set_timeout(minutes.min(MAX_LOCK_TIMEOUT_MINUTES));
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
    clip_state.schedule_clear(clear_after_secs.min(MAX_CLIPBOARD_CLEAR_SECS));
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
    let h = host.trim_matches(|c| c == '[' || c == ']').to_ascii_lowercase();
    if h == "localhost" {
        return true;
    }

    if let Ok(ip) = h.parse::<IpAddr>() {
        return is_private_ip(ip);
    }

    if let Ok(ip) = h.parse::<Ipv6Addr>() {
        if let Some(mapped) = ip.to_ipv4_mapped() {
            return is_private_ip(IpAddr::V4(mapped));
        }
        return is_private_ip(IpAddr::V6(ip));
    }

    false
}

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_broadcast()
        }
        IpAddr::V6(ip) => {
            ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_unique_local()
                || ip.is_unicast_link_local()
        }
    }
}

async fn resolve_public_host(host: String, port: u16) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let addrs = (host.as_str(), port)
            .to_socket_addrs()
            .map_err(|e| format!("failed to resolve callback host: {e}"))?;

        let mut saw_any = false;
        for addr in addrs {
            saw_any = true;
            if is_private_ip(addr.ip()) {
                return Err("callback URL must not resolve to a private or loopback address".into());
            }
        }

        if !saw_any {
            return Err("callback URL host did not resolve to any addresses".into());
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

const MAX_CALLBACK_BODY: usize = 4 * 1024; // 4 KB

fn sanitize_reqwest_error(error: reqwest::Error) -> String {
    if let Some(status) = error.status() {
        return format!("callback server returned HTTP {}", status.as_u16());
    }

    if error.is_timeout() {
        return "callback request timed out".into();
    }

    if error.is_connect() {
        return "failed to connect to callback server".into();
    }

    "callback request failed".into()
}

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
    if !is_local {
        let port = parsed.port_or_known_default().ok_or("callback URL has no usable port")?;
        resolve_public_host(host.to_string(), port).await?;
    }

    http_client()
        .post(parsed)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(sanitize_reqwest_error)?
        .error_for_status()
        .map_err(sanitize_reqwest_error)?;

    Ok(())
}
