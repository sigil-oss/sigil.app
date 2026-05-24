use aes_gcm::aead::{Aead, OsRng, rand_core::RngCore};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use std::path::PathBuf;
use tauri::command;

const STORE_KEY_TARGET: &str = "sigil-store-key";
const STORE_VALUE_PREFIX: &str = "enc-v1:";
const STORE_KEY_FILE: &str = "store-key";

fn store_key_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .ok_or_else(|| "APPDATA is not set".to_string())?;
        return Ok(base.join("com.qubic.sigil").join(STORE_KEY_FILE));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let base = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share"))
            })
            .ok_or_else(|| "HOME is not set".to_string())?;
        Ok(base.join("com.qubic.sigil").join(STORE_KEY_FILE))
    }
}

fn load_store_key_file() -> Result<Option<String>, String> {
    let path = store_key_path()?;
    match std::fs::read_to_string(path) {
        Ok(value) => Ok(Some(value.trim().to_string())),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

fn delete_store_key_file() -> Result<(), String> {
    let path = store_key_path()?;
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

fn store_key_file(secret: &str) -> Result<(), String> {
    let path = store_key_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "invalid store key path".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    std::fs::write(&path, secret).map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        let _ = std::fs::set_permissions(&path, perms);
    }

    Ok(())
}

#[cfg(all(debug_assertions, not(target_os = "windows")))]
fn legacy_dev_fallback_key_path() -> Result<PathBuf, String> {
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share"))
        })
        .ok_or_else(|| "HOME is not set".to_string())?;
    Ok(base.join("sigil").join("dev-store-key"))
}

#[cfg(all(debug_assertions, not(target_os = "windows")))]
fn load_legacy_dev_fallback_key() -> Result<Option<String>, String> {
    let path = legacy_dev_fallback_key_path()?;
    match std::fs::read_to_string(path) {
        Ok(value) => Ok(Some(value.trim().to_string())),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[cfg(target_os = "windows")]
mod secret_store {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::Security::Credentials::{
        CredReadW, CredWriteW, CREDENTIALW, CRED_FLAGS, CRED_PERSIST_LOCAL_MACHINE,
        CRED_TYPE_GENERIC,
    };
    use windows::core::{PCWSTR, PWSTR};

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn store(target_name: &str, secret: &str) -> Result<(), String> {
        let target = to_wide(target_name);
        let mut blob = secret.as_bytes().to_vec();

        let cred = CREDENTIALW {
            Flags: CRED_FLAGS(0),
            Type: CRED_TYPE_GENERIC,
            TargetName: PWSTR(target.as_ptr() as *mut u16),
            Comment: PWSTR::null(),
            LastWritten: FILETIME::default(),
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: std::ptr::null_mut(),
            TargetAlias: PWSTR::null(),
            UserName: PWSTR::null(),
        };

        unsafe { CredWriteW(&cred, 0).map_err(|e| format!("CredWriteW: {e}")) }
    }

    pub fn load(target_name: &str) -> Result<String, String> {
        let target = to_wide(target_name);
        let mut pcred: *mut CREDENTIALW = std::ptr::null_mut();

        unsafe {
            windows::Win32::Security::Credentials::CredReadW(
                PCWSTR(target.as_ptr()),
                CRED_TYPE_GENERIC,
                0,
                &mut pcred,
            )
            .map_err(|e| format!("CredReadW: {e}"))?;

            let cred = &*pcred;
            let blob = std::slice::from_raw_parts(
                cred.CredentialBlob,
                cred.CredentialBlobSize as usize,
            );
            let result = std::str::from_utf8(blob)
                .map(|s| s.to_string())
                .map_err(|e| format!("utf8: {e}"));

            windows::Win32::Security::Credentials::CredFree(pcred as *const _);
            result
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod secret_store {
    use keyring::Entry;
    use keyring::Error;

    fn entry(target_name: &str) -> Result<Entry, String> {
        Entry::new("sigil-store", target_name).map_err(|e| e.to_string())
    }

    pub fn load_optional(target_name: &str) -> Result<Option<String>, String> {
        match entry(target_name)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(Error::NoEntry) => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    }

    pub fn store(target_name: &str, secret: &str) -> Result<(), String> {
        let entry = entry(target_name)?;
        entry.set_password(secret).map_err(|e| e.to_string())?;
        entry
            .get_password()
            .map_err(|e| format!("stored but unreadable: {e}"))?;
        Ok(())
    }

}

fn decode_store_key(encoded: &str, label: &str) -> Result<[u8; 32], String> {
    let decoded = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|e| format!("invalid {label}: {e}"))?;
    decoded
        .try_into()
        .map_err(|_| format!("invalid {label} length"))
}

fn migrate_file_key_to_secure_store(encoded: &str) -> Result<[u8; 32], String> {
    let key = decode_store_key(encoded, "stored metadata key file")?;
    match secret_store::store(STORE_KEY_TARGET, encoded) {
        Ok(()) => {
            let _ = delete_store_key_file();
            Ok(key)
        }
        Err(err) => {
            eprintln!(
                "[sigil] secure metadata-key storage unavailable, continuing with file fallback: {err}"
            );
            Ok(key)
        }
    }
}

fn get_or_create_store_key() -> Result<[u8; 32], String> {
    #[cfg(target_os = "windows")]
    if let Ok(encoded) = secret_store::load(STORE_KEY_TARGET) {
        return decode_store_key(&encoded, "stored metadata key");
    }

    #[cfg(not(target_os = "windows"))]
    match secret_store::load_optional(STORE_KEY_TARGET) {
        Ok(Some(encoded)) => {
            return decode_store_key(&encoded, "stored metadata key");
        }
        Ok(None) => {}
        Err(_err) => {}
    }

    if let Some(encoded) = load_store_key_file()? {
        return migrate_file_key_to_secure_store(&encoded);
    }

    #[cfg(all(debug_assertions, not(target_os = "windows")))]
    if let Some(encoded) = load_legacy_dev_fallback_key()? {
        return migrate_file_key_to_secure_store(&encoded);
    }

    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    let encoded = URL_SAFE_NO_PAD.encode(key);
    match secret_store::store(STORE_KEY_TARGET, &encoded) {
        Ok(()) => {
            let _ = delete_store_key_file();
        }
        Err(err) => {
            eprintln!(
                "[sigil] secure metadata-key storage unavailable, using file fallback: {err}"
            );
            store_key_file(&encoded)?;
        }
    }
    Ok(key)
}

fn encrypt_value(value: &str) -> Result<String, String> {
    let key = get_or_create_store_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);

    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), value.as_bytes())
        .map_err(|_| "store encryption failed".to_string())?;

    let mut payload = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);

    Ok(format!("{STORE_VALUE_PREFIX}{}", URL_SAFE_NO_PAD.encode(payload)))
}

fn decrypt_value(value: &str) -> Result<String, String> {
    let Some(encoded) = value.strip_prefix(STORE_VALUE_PREFIX) else {
        return Ok(value.to_string());
    };

    let key = get_or_create_store_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let payload = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|e| format!("invalid encrypted metadata payload: {e}"))?;
    if payload.len() < 13 {
        return Err("encrypted metadata payload is too short".into());
    }
    let (nonce_bytes, ciphertext) = payload.split_at(12);
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|_| "store decryption failed".to_string())?;
    String::from_utf8(plaintext).map_err(|e| format!("store plaintext is not utf-8: {e}"))
}

#[command]
pub async fn encrypt_store_value(value: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || encrypt_value(&value))
        .await
        .map_err(|e| e.to_string())?
}

#[command]
pub async fn decrypt_store_value(value: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || decrypt_value(&value))
        .await
        .map_err(|e| e.to_string())?
}
