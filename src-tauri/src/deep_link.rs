use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_store::StoreExt;
use tiny_keccak::{Hasher, KangarooTwelve};
use url::Url;

const NONCE_STORE_PATH: &str = "sigil-security.json";
const NONCE_STORE_KEY: &str = "seen_nonces";
const MAX_NONCE_AGE_SECS: u64 = 3600;
const MAX_SIGN_MESSAGE_LEN: usize = 2048;

pub struct DeepLinkState {
    pending_requests: Arc<Mutex<VecDeque<String>>>,
    /// Maps nonce → unix timestamp of first receipt for time-bounded replay protection.
    seen_nonces: Arc<Mutex<HashMap<String, u64>>>,
}

impl Default for DeepLinkState {
    fn default() -> Self {
        Self {
            pending_requests: Arc::new(Mutex::new(VecDeque::new())),
            seen_nonces: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl DeepLinkState {
    pub fn store(&self, payload: String) {
        self.pending_requests
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push_back(payload);
    }

    pub fn take(&self) -> Option<String> {
        self.pending_requests
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .pop_front()
    }

    pub fn peek(&self) -> Option<String> {
        self.pending_requests
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .front()
            .cloned()
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
    redirect_uri: Option<String>,
    proof: Option<Value>,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn encode_identity_checksum(public_key: &[u8; 32]) -> [u8; 4] {
    let mut hasher = KangarooTwelve::new(b"");
    hasher.update(public_key);

    let mut digest = [0u8; 3];
    hasher.finalize(&mut digest);

    let mut checksum = (digest[0] as u32) | ((digest[1] as u32) << 8) | ((digest[2] as u32) << 16);
    checksum &= 0x3ffff;

    let mut output = [0u8; 4];
    for ch in &mut output {
        *ch = (checksum % 26) as u8 + b'A';
        checksum /= 26;
    }
    output
}

fn is_valid_qubic_identity(identity: &str) -> bool {
    if identity.len() != 60 || !identity.bytes().all(|b| b.is_ascii_uppercase()) {
        return false;
    }

    let mut public_key = [0u8; 32];
    for fragment_index in 0..4 {
        let mut fragment = 0u64;
        for digit_index in (0..14).rev() {
            let idx = fragment_index * 14 + digit_index;
            let digit = (identity.as_bytes()[idx] - b'A') as u64;
            fragment = match fragment
                .checked_mul(26)
                .and_then(|value| value.checked_add(digit))
            {
                Some(value) => value,
                None => return false,
            };
        }
        public_key[fragment_index * 8..(fragment_index + 1) * 8]
            .copy_from_slice(&fragment.to_le_bytes());
    }

    let expected_checksum = encode_identity_checksum(&public_key);
    identity.as_bytes()[56..60] == expected_checksum
}

fn parse_positive_i64(value: &Value) -> Option<i64> {
    if let Some(number) = value.as_i64() {
        return Some(number);
    }
    value.as_str()?.parse::<i64>().ok()
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

    let (request_value, callback_from_payload, redirect_uri_from_payload, proof) = match value.get("request") {
        Some(request) if request.is_object() => (
            request.clone(),
            value.get("callback").and_then(|v| v.as_str()).map(|s| s.to_string()),
            value.get("redirect_uri").and_then(|v| v.as_str()).map(|s| s.to_string()),
            value.get("proof").cloned(),
        ),
        _ => (value.clone(), None, None, None),
    };

    // Required fields
    let req_type = request_value["type"].as_str().ok_or("missing 'type' field")?;

    if ![
        "transfer",
        "sc_call",
        "sign_message",
        "verify_message",
        "connect",
    ]
    .contains(&req_type)
    {
        return Err(format!("unknown request type: {req_type}"));
    }

    let nonce = request_value["nonce"].as_str().ok_or("missing 'nonce' field")?;
    if nonce.len() < 16 || nonce.len() > 128 {
        return Err("nonce must be 16–128 characters".into());
    }
    if !nonce
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'=' | b'+'))
    {
        return Err("nonce must use a base64url-safe or alphanumeric charset".into());
    }

    let dapp_origin = request_value["dapp"]["origin"]
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
    let exp = request_value["exp"].as_u64().unwrap_or_else(|| now + 300);
    if exp <= now {
        return Err("request has expired".into());
    }
    if exp > now + MAX_NONCE_AGE_SECS {
        return Err("request expiry too far in the future (max 1 hour)".into());
    }

    // Validate callback URL if present
    let callback = match (callback_from_payload, cb_param) {
        (Some(from_payload), Some(from_query)) if from_payload != from_query => {
            return Err("callback URL mismatch between payload and query parameter".into())
        }
        (Some(from_payload), _) => Some(from_payload),
        (None, from_query) => from_query,
    };

    fn validate_delivery_url(url_str: &str, field: &str) -> Result<(), String> {
        let url = Url::parse(url_str).map_err(|_| format!("invalid {field} URL"))?;
        let host = url.host_str().unwrap_or("");
        let is_local = matches!(host, "localhost" | "127.0.0.1");
        if url.scheme() != "https" && !(url.scheme() == "http" && is_local) {
            return Err(format!("{field} must use HTTPS (or http://localhost / http://127.0.0.1 for local dev)"));
        }
        if !is_local && crate::commands::is_private_host(host) {
            return Err(format!("{field} must not target a private or loopback address"));
        }
        Ok(())
    }

    if let Some(cb) = &callback {
        validate_delivery_url(cb, "callback URL")?;
    }

    let redirect_uri = redirect_uri_from_payload;
    if let Some(ru) = &redirect_uri {
        validate_delivery_url(ru, "redirect_uri")?;
    }

    // Type-specific checks
    match req_type {
        "transfer" => {
            let to = request_value["to"].as_str().ok_or("transfer: missing 'to'")?;
            if !is_valid_qubic_identity(to) {
                let preview: String = to.chars().take(8).collect();
                return Err(format!(
                    "transfer: 'to' must be a valid Qubic identity, got '{}'",
                    preview
                ));
            }
            let amount = parse_positive_i64(&request_value["amount"])
                .ok_or("transfer: missing 'amount'")?;
            if amount <= 0 {
                return Err("transfer: 'amount' must be positive".into());
            }
        }
        "sc_call" => {
            let idx = request_value["contract_index"]
                .as_i64()
                .ok_or("sc_call: missing 'contract_index'")?;
            if !(0..=63).contains(&idx) {
                return Err(format!("sc_call: 'contract_index' out of range: {idx}"));
            }
            let input_type = request_value["input_type"]
                .as_i64()
                .ok_or("sc_call: missing 'input_type'")?;
            if input_type < 0 {
                return Err("sc_call: 'input_type' must be non-negative".into());
            }
        }
        "sign_message" => {
            let msg = request_value["message"]
                .as_str()
                .ok_or("sign_message: missing 'message'")?;
            if msg.is_empty() {
                return Err("sign_message: 'message' must not be empty".into());
            }
            if msg.chars().count() > MAX_SIGN_MESSAGE_LEN {
                return Err("sign_message: 'message' exceeds 2048 characters".into());
            }
        }
        "verify_message" => {
            let msg = request_value["message"]
                .as_str()
                .ok_or("verify_message: missing 'message'")?;
            if msg.is_empty() {
                return Err("verify_message: 'message' must not be empty".into());
            }
            request_value["signature"]
                .as_str()
                .ok_or("verify_message: missing 'signature'")?;
            request_value["public_key"]
                .as_str()
                .ok_or("verify_message: missing 'public_key'")?;
        }
        // "connect" — no extra required fields
        _ => {}
    }

    Ok(ParsedRequest {
        nonce: nonce.to_string(),
        request: request_value,
        callback,
        redirect_uri,
        proof,
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
                eprintln!(
                    "[sigil] deep link rejected: duplicate nonce '{}'",
                    parsed.nonce
                );
                return;
            }
            let envelope = serde_json::json!({
                "request": parsed.request,
                "callback": parsed.callback,
                "redirect_uri": parsed.redirect_uri,
                "proof": parsed.proof,
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
