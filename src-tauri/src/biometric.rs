use keyring::Entry;
use tauri::command;

fn keyring_entry(vault_id: &str) -> Result<Entry, String> {
    Entry::new("sigil", &format!("bio:{vault_id}")).map_err(|e| e.to_string())
}

// ── macOS: LAContext via objc ──────────────────────────────────────────────

#[cfg(target_os = "macos")]
mod platform {
    use block::ConcreteBlock;
    use objc::runtime::{Object, BOOL, YES};
    use objc::{class, msg_send, sel, sel_impl};
    use std::sync::mpsc;

    #[link(name = "LocalAuthentication", kind = "framework")]
    extern "C" {}

    // LAPolicyDeviceOwnerAuthenticationWithBiometrics = 1
    const LA_BIOMETRICS: usize = 1;

    pub fn available() -> bool {
        unsafe {
            let ctx: *mut Object = msg_send![class!(LAContext), new];
            let mut err: *mut Object = std::ptr::null_mut();
            let can: BOOL = msg_send![ctx, canEvaluatePolicy:LA_BIOMETRICS error:&mut err];
            let _: () = msg_send![ctx, release];
            can == YES
        }
    }

    pub fn authenticate(reason: &str) -> Result<(), String> {
        let (tx, rx) = mpsc::channel::<bool>();

        let block = ConcreteBlock::new(move |success: BOOL, _err: *mut Object| {
            let _ = tx.send(success == YES);
        });
        let block = block.copy();

        unsafe {
            let ctx: *mut Object = msg_send![class!(LAContext), new];
            let bytes = reason.as_bytes();
            let ns_alloc: *mut Object = msg_send![class!(NSString), alloc];
            let ns_reason: *mut Object = msg_send![
                ns_alloc,
                initWithBytes: bytes.as_ptr() as *const std::os::raw::c_void
                length: bytes.len()
                encoding: 4usize
            ];
            let _: () = msg_send![
                ctx,
                evaluatePolicy: LA_BIOMETRICS
                localizedReason: ns_reason
                reply: &*block
            ];
            let _: () = msg_send![ctx, release];
            let _: () = msg_send![ns_reason, release];
        }

        rx.recv()
            .map_err(|_| "Authentication cancelled".to_string())
            .and_then(|ok| {
                if ok {
                    Ok(())
                } else {
                    Err("Biometric authentication failed".to_string())
                }
            })
    }
}

// ── Windows: UserConsentVerifier ───────────────────────────────────────────

#[cfg(target_os = "windows")]
mod platform {
    use windows::Security::Credentials::UI::{
        UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability,
    };
    use windows::core::HSTRING;

    pub fn available() -> bool {
        let Ok(op) = UserConsentVerifier::CheckAvailabilityAsync() else {
            return false;
        };
        matches!(op.get(), Ok(r) if r == UserConsentVerifierAvailability::Available)
    }

    pub fn authenticate(reason: &str) -> Result<(), String> {
        let reason_w = HSTRING::from(reason);
        let op = UserConsentVerifier::RequestVerificationAsync(&reason_w)
            .map_err(|e| format!("RequestVerificationAsync: {e}"))?;
        let result = op.get().map_err(|e| format!("IAsyncOperation::get: {e}"))?;
        if result == UserConsentVerificationResult::Verified {
            Ok(())
        } else if result == UserConsentVerificationResult::Canceled {
            Err("Canceled".to_string())
        } else if result == UserConsentVerificationResult::DeviceNotPresent {
            Err("DeviceNotPresent: no biometric hardware detected".to_string())
        } else if result == UserConsentVerificationResult::NotConfiguredForUser {
            Err("NotConfiguredForUser: Windows Hello not set up for this account".to_string())
        } else if result == UserConsentVerificationResult::DisabledByPolicy {
            Err("DisabledByPolicy: biometrics disabled by system policy".to_string())
        } else if result == UserConsentVerificationResult::DeviceBusy {
            Err("DeviceBusy: biometric device is busy".to_string())
        } else if result == UserConsentVerificationResult::RetriesExhausted {
            Err("RetriesExhausted: too many failed attempts".to_string())
        } else {
            Err(format!("UnknownResult({})", result.0))
        }
    }
}

// ── Linux / other: unsupported ─────────────────────────────────────────────

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    pub fn available() -> bool {
        false
    }

    pub fn authenticate(_reason: &str) -> Result<(), String> {
        Err("Biometric authentication is not supported on this platform".to_string())
    }
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[command]
pub async fn check_biometric_available() -> bool {
    tokio::task::spawn_blocking(platform::available)
        .await
        .unwrap_or(false)
}

#[command]
pub async fn enable_biometric(vault_id: String, password: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        keyring_entry(&vault_id)?
            .set_password(&password)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub async fn biometric_unlock(vault_id: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        platform::authenticate("Unlock Sigil vault")?;
        keyring_entry(&vault_id)?
            .get_password()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub async fn disable_biometric(vault_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        keyring_entry(&vault_id)?
            .delete_credential()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
