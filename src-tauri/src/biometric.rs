use tauri::command;
use crate::vault_crypto::{decrypt_vault_data, VaultData};

// ── Credential storage ─────────────────────────────────────────────────────
//
// On Windows the `keyring` crate writes to a session-scoped store that doesn't
// survive app restart. We use CredWriteW/CredReadW directly with
// CRED_PERSIST_LOCAL_MACHINE to guarantee persistence.

#[cfg(target_os = "windows")]
mod cred_store {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_FLAGS,
        CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };
    use windows::core::{PCWSTR, PWSTR};

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn target(vault_id: &str) -> Vec<u16> {
        to_wide(&format!("sigil-vault/{}", vault_id))
    }

    pub fn store(vault_id: &str, password: &str) -> Result<(), String> {
        let target = target(vault_id);
        let mut blob = password.as_bytes().to_vec();

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

        unsafe { CredWriteW(&cred, 0).map_err(|e| e.to_string()) }
    }

    pub fn load(vault_id: &str) -> Result<String, String> {
        let target = target(vault_id);
        let mut pcred: *mut CREDENTIALW = std::ptr::null_mut();

        unsafe {
            CredReadW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, 0, &mut pcred)
                .map_err(|e| format!("CredReadW: {e}"))?;

            let cred = &*pcred;
            let blob = std::slice::from_raw_parts(
                cred.CredentialBlob,
                cred.CredentialBlobSize as usize,
            );
            let result = std::str::from_utf8(blob)
                .map(|s| s.to_string())
                .map_err(|e| format!("utf8: {e}"));

            CredFree(pcred as *const _);
            result
        }
    }

    pub fn delete(vault_id: &str) -> Result<(), String> {
        let target = target(vault_id);
        unsafe {
            CredDeleteW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, 0)
                .map_err(|e| e.to_string())
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod cred_store {
    use keyring::Entry;

    fn entry(vault_id: &str) -> Result<Entry, String> {
        Entry::new("sigil-bio", vault_id).map_err(|e| e.to_string())
    }

    pub fn store(vault_id: &str, password: &str) -> Result<(), String> {
        let e = entry(vault_id)?;
        e.set_password(password).map_err(|e| e.to_string())?;
        e.get_password()
            .map_err(|e| format!("stored but unreadable: {e}"))?;
        Ok(())
    }

    pub fn load(vault_id: &str) -> Result<String, String> {
        entry(vault_id)?
            .get_password()
            .map_err(|e| e.to_string())
    }

    pub fn delete(vault_id: &str) -> Result<(), String> {
        entry(vault_id)?
            .delete_credential()
            .map_err(|e| e.to_string())
    }
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

        // SAFETY: ctx must remain alive until after rx.recv() because evaluatePolicy
        // is async — releasing ctx while authentication is in progress causes a UAF.
        let ctx: *mut Object = unsafe { msg_send![class!(LAContext), new] };
        unsafe {
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
            // ns_reason is retained by evaluatePolicy; release our reference now.
            let _: () = msg_send![ns_reason, release];
        }

        let result = rx.recv()
            .map_err(|_| "Authentication cancelled".to_string())
            .and_then(|ok| {
                if ok { Ok(()) } else { Err("Biometric authentication failed".to_string()) }
            });

        // Release ctx only after the async callback has fired.
        unsafe { let _: () = msg_send![ctx, release]; }
        result
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
        // Confirm biometric before storing the password to prevent silent enrollment
        platform::authenticate("Enable biometric unlock for Sigil")?;
        cred_store::store(&vault_id, &password)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub async fn biometric_unlock(vault_id: String, vault_data: VaultData) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        platform::authenticate("Unlock Sigil vault")?;
        let password = cred_store::load(&vault_id)?;
        decrypt_vault_data(&vault_data, &password)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub async fn disable_biometric(vault_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || cred_store::delete(&vault_id))
        .await
        .map_err(|e| e.to_string())?
}
