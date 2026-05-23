use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_store::StoreExt;
use url::Url;

const NONCE_STORE_PATH: &str = "sigil-security.json";
const NONCE_STORE_KEY: &str = "seen_nonces";
const MAX_NONCE_AGE_SECS: u64 = 3600;

pub struct DeepLinkState {
    pending_request: Arc<Mutex<Option<String>>>,
    /// Maps nonce → unix timestamp of first receipt for time-bounded replay protection.
    seen_nonces: Arc<Mutex<HashMap<String, u64>>>,
}

impl Default for DeepLinkState {
    fn default() -> Self {
        Self {
            pending_request: Arc::new(Mutex::new(None)),
            seen_nonces: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl DeepLinkState {
    pub fn store(&self, payload: String) {
        *self.pending_request.lock().unwrap_or_else(|e| e.into_inner()) = Some(payload);
    }

    pub fn take(&self) -> Option<String> {
        self.pending_request.lock().unwrap_or_else(|e| e.into_inner()).take()
    }

    pub fn peek(&self) -> Option<String> {
        self.pending_request.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn prune_seen_nonces(seen: &mut HashMap<String, u64>, now: u64) {
        seen.retain(|_, &mut inserted_at| now.saturating_sub(inserted_at) < MAX_NONCE_AGE_SECS);
    }

    pub fn load_seen_nonces(&self, app: &AppHandle) {
        let Ok(store) = app.store(NONCE_STORE_PATH) else {
            return;
        };
        let Some(value) = store.get(NONCE_STORE_KEY) else {
            return;
        };
        let Ok(mut seen) = serde_json::from_value::<HashMap<String, u64>>(value) else {
            return;
        };
        Self::prune_seen_nonces(&mut seen, now_secs());
        *self.seen_nonces.lock().unwrap_or_else(|e| e.into_inner()) = seen;
    }

    fn persist_seen_nonces(&self, app: &AppHandle) {
        let Ok(store) = app.store(NONCE_STORE_PATH) else {
            return;
        };
        let seen = self
            .seen_nonces
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        if let Ok(value) = serde_json::to_value(seen) {
            store.set(NONCE_STORE_KEY, value);
            let _ = store.save();
        }
    }

    /// Returns false if the nonce was already seen within the last hour (replay), true if fresh.
    pub fn record_nonce(&self, app: &AppHandle, nonce: &str) -> bool {
        let mut seen = self.seen_nonces.lock().unwrap_or_else(|e| e.into_inner());
        let now = now_secs();
        Self::prune_seen_nonces(&mut seen, now);
        if seen.contains_key(nonce) {
            return false;
        }
        seen.insert(nonce.to_string(), now);
        drop(seen);
        self.persist_seen_nonces(app);
        true
    }
}

struct ParsedRequest {
    request: Value,
    nonce: String,
    callback: Option<String>,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn validate(uri_str: &str) -> Result<ParsedRequest, String> {
    let url = Url::parse(uri_str).map_err(|e| format!("invalid URI: {e}"))?;

    if url.scheme() != "sigil" {
        return Err("not a sigil:// URI".into());
    }
    if url.host_str() != Some("v1") || url.path() != "/request" {
        return Err("expected sigil://v1/request".into());
    }

    let mut d_param: Option<String> = None;
    let mut cb_param: Option<String> = None;
    for (k, v) in url.query_pairs() {
        match k.as_ref() {
            "d" => d_param = Some(v.into_owned()),
            "cb" => cb_param = Some(v.into_owned()),
            _ => {}
        }
    }

    let d = d_param.ok_or("missing 'd' parameter")?;

    if d.len() > 8192 {
        return Err("payload too large (max 8192 bytes base64)".into());
    }

    let bytes = URL_SAFE_NO_PAD
        .decode(&d)
        .map_err(|e| format!("base64url decode failed: {e}"))?;

    let json_str =
        String::from_utf8(bytes).map_err(|_| "payload is not valid UTF-8".to_string())?;

    let value: Value =
        serde_json::from_str(&json_str).map_err(|e| format!("JSON parse failed: {e}"))?;

    // Required fields
    let req_type = value["type"]
        .as_str()
        .ok_or("missing 'type' field")?;

    if !["transfer", "sc_call", "sign_message", "verify_message", "connect"].contains(&req_type) {
        return Err(format!("unknown request type: {req_type}"));
    }

    let nonce = value["nonce"].as_str().ok_or("missing 'nonce' field")?;
    if nonce.len() < 8 || nonce.len() > 128 {
        return Err("nonce must be 8–128 characters".into());
    }

    let dapp_origin = value["dapp"]["origin"]
        .as_str()
        .ok_or("missing 'dapp.origin'")?;
    let parsed_origin =
        Url::parse(dapp_origin).map_err(|_| format!("invalid dapp.origin: {dapp_origin}"))?;
    if parsed_origin.scheme() != "https" {
        return Err("dapp.origin must use HTTPS".into());
    }

    // Expiry check: missing exp defaults to 5 minutes from receipt; exp too far in
    // the future is clamped so dApps cannot create permanent requests.
    let now = now_secs();
    let exp = value["exp"].as_u64().unwrap_or_else(|| now + 300);
    if exp <= now {
        return Err("request has expired".into());
    }
    if exp > now + MAX_NONCE_AGE_SECS {
        return Err("request expiry too far in the future (max 1 hour)".into());
    }

    // Validate callback URL if present
    if let Some(cb) = &cb_param {
        let cb_url = Url::parse(cb).map_err(|_| "invalid callback URL".to_string())?;
        let host = cb_url.host_str().unwrap_or("");
        // Allow http only to localhost/127.0.0.1; block all other non-HTTPS and all loopback/private addresses.
        let is_local = matches!(host, "localhost" | "127.0.0.1");
        if cb_url.scheme() != "https" && !(cb_url.scheme() == "http" && is_local) {
            return Err("callback URL must use HTTPS (or http://localhost / http://127.0.0.1 for local dev)".into());
        }
        if !is_local && crate::commands::is_private_host(host) {
            return Err("callback URL must not target a private or loopback address".into());
        }
    }

    // Type-specific checks
    match req_type {
        "transfer" => {
            let to = value["to"].as_str().ok_or("transfer: missing 'to'")?;
            // Qubic identities are exactly 60 uppercase A-Z characters
            if to.len() != 60 || !to.bytes().all(|b| b.is_ascii_uppercase()) {
                let preview: String = to.chars().take(8).collect();
                return Err(format!(
                    "transfer: 'to' must be 60 uppercase letters, got '{}'",
                    preview
                ));
            }
            let amount = value["amount"].as_i64().ok_or("transfer: missing 'amount'")?;
            if amount <= 0 {
                return Err("transfer: 'amount' must be positive".into());
            }
        }
        "sc_call" => {
            let idx = value["contract_index"]
                .as_i64()
                .ok_or("sc_call: missing 'contract_index'")?;
            if !(0..=63).contains(&idx) {
                return Err(format!("sc_call: 'contract_index' out of range: {idx}"));
            }
            let input_type = value["input_type"]
                .as_i64()
                .ok_or("sc_call: missing 'input_type'")?;
            if input_type < 0 {
                return Err("sc_call: 'input_type' must be non-negative".into());
            }
        }
        "sign_message" => {
            let msg = value["message"]
                .as_str()
                .ok_or("sign_message: missing 'message'")?;
            if msg.is_empty() {
                return Err("sign_message: 'message' must not be empty".into());
            }
        }
        "verify_message" => {
            let msg = value["message"]
                .as_str()
                .ok_or("verify_message: missing 'message'")?;
            if msg.is_empty() {
                return Err("verify_message: 'message' must not be empty".into());
            }
            value["signature"]
                .as_str()
                .ok_or("verify_message: missing 'signature'")?;
            value["public_key"]
                .as_str()
                .ok_or("verify_message: missing 'public_key'")?;
        }
        // "connect" — no extra required fields
        _ => {}
    }

    Ok(ParsedRequest {
        nonce: nonce.to_string(),
        request: value,
        callback: cb_param,
    })
}

pub fn process_url(app: &AppHandle, raw: &str) {
    if !raw.starts_with("sigil://") {
        return;
    }
    match validate(raw) {
        Ok(parsed) => {
            let state = app.state::<DeepLinkState>();
            if !state.record_nonce(app, &parsed.nonce) {
                eprintln!("[sigil] deep link rejected: duplicate nonce '{}'", parsed.nonce);
                return;
            }
            let envelope = serde_json::json!({
                "request": parsed.request,
                "callback": parsed.callback,
            });
            let payload = envelope.to_string();
            state.store(payload.clone());
            app.emit("sigil:request", payload).ok();
        }
        Err(e) => {
            eprintln!("[sigil] deep link rejected: {e}");
        }
    }
}

pub fn register_handler(app: &AppHandle) {
    app.state::<DeepLinkState>().load_seen_nonces(app);
    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            process_url(&handle, &url.to_string());
        }
    });
}
