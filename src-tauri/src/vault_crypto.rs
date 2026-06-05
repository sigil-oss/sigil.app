use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use pbkdf2::pbkdf2_hmac_array;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use tauri::command;

const VAULT_VERSION: u32 = 1;
const PBKDF2_ITERATIONS: u32 = 600_000;
const MIN_PBKDF2_ITERATIONS: u32 = 100_000;
const SALT_BYTES: usize = 32;
const IV_BYTES: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultData {
    pub version: u32,
    pub iterations: u32,
    pub salt: String,
    pub iv: String,
    pub ciphertext: String,
}

#[derive(Serialize, Deserialize)]
struct VaultPayload {
    seeds: Vec<String>,
}

fn derive_key(password: &str, salt: &[u8], iterations: u32) -> [u8; 32] {
    pbkdf2_hmac_array::<Sha256, 32>(password.as_bytes(), salt, iterations)
}

pub fn encrypt_vault_data(password: &str, seeds: &[String]) -> Result<VaultData, String> {
    let salt_key = Aes256Gcm::generate_key(&mut OsRng);
    let salt = salt_key.as_slice(); // full 32 bytes (SALT_BYTES)
    let iv = Aes256Gcm::generate_nonce(&mut OsRng);

    let key = derive_key(password, salt, PBKDF2_ITERATIONS);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let plaintext = serde_json::to_vec(&VaultPayload {
        seeds: seeds.to_vec(),
    })
    .map_err(|e| e.to_string())?;
    let ciphertext = cipher
        .encrypt(&iv, plaintext.as_ref())
        .map_err(|_| "vault encryption failed".to_string())?;

    Ok(VaultData {
        version: VAULT_VERSION,
        iterations: PBKDF2_ITERATIONS,
        salt: hex::encode(salt),
        iv: hex::encode(iv.as_slice()),
        ciphertext: hex::encode(ciphertext),
    })
}

pub fn decrypt_vault_data(vault_data: &VaultData, password: &str) -> Result<Vec<String>, String> {
    if vault_data.version != VAULT_VERSION {
        return Err(format!("unsupported version {}", vault_data.version));
    }

    let salt = hex::decode(&vault_data.salt).map_err(|_| "malformed salt".to_string())?;
    let iv = hex::decode(&vault_data.iv).map_err(|_| "malformed iv".to_string())?;
    let ciphertext =
        hex::decode(&vault_data.ciphertext).map_err(|_| "malformed ciphertext".to_string())?;
    if salt.len() != 16 && salt.len() != SALT_BYTES {
        return Err("malformed salt".to_string());
    }
    if iv.len() != IV_BYTES {
        return Err("malformed iv".to_string());
    }
    if vault_data.iterations < MIN_PBKDF2_ITERATIONS {
        return Err(format!("vault iteration count too low: {}", vault_data.iterations));
    }

    let key = derive_key(password, &salt, vault_data.iterations);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&iv), ciphertext.as_ref())
        .map_err(|_| "vault decryption failed".to_string())?;

    let payload: VaultPayload =
        serde_json::from_slice(&plaintext).map_err(|_| "vault payload is invalid".to_string())?;
    Ok(payload.seeds)
}

#[command]
pub async fn encrypt_vault(password: String, seeds: Vec<String>) -> Result<VaultData, String> {
    tokio::task::spawn_blocking(move || encrypt_vault_data(&password, &seeds))
        .await
        .map_err(|e| e.to_string())?
}

#[command]
pub async fn decrypt_vault(vault_data: VaultData, password: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || decrypt_vault_data(&vault_data, &password))
        .await
        .map_err(|e| e.to_string())?
}
