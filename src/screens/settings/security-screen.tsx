import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { usePersistedStore } from "@/store/persisted";
import { unlockVault } from "@/lib/vault";

const TIMEOUT_OPTIONS: { label: string; value: number }[] = [
  { label: "1 minute", value: 1 },
  { label: "5 minutes", value: 5 },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "Never", value: 0 },
];

const CLIPBOARD_OPTIONS: { label: string; value: number }[] = [
  { label: "15 seconds", value: 15 },
  { label: "30 seconds", value: 30 },
  { label: "1 minute", value: 60 },
  { label: "Never", value: 0 },
];

export default function SecurityScreen() {
  const navigate = useNavigate();

  const autoLockMinutes = usePersistedStore((s) => s.settings.autoLockMinutes);
  const lockOnWindowBlur = usePersistedStore((s) => s.settings.lockOnWindowBlur);
  const lockOnSleep = usePersistedStore((s) => s.settings.lockOnSleep);
  const clipboardClearSeconds = usePersistedStore((s) => s.settings.clipboardClearSeconds);
  const biometricVaultIds = usePersistedStore((s) => s.settings.biometricVaultIds) ?? [];
  const vaults = usePersistedStore((s) => s.vaults);
  const settings = usePersistedStore((s) => s.settings);
  const updateSettings = usePersistedStore((s) => s.updateSettings);

  const vault = vaults.find((v) => v.id === settings.activeVaultId) ?? vaults[0];
  const bioEnabled = vault ? biometricVaultIds.includes(vault.id) : false;

  const [bioAvailable, setBioAvailable] = useState<boolean | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [enablePw, setEnablePw] = useState("");
  const [enableError, setEnableError] = useState("");
  const [enableLoading, setEnableLoading] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    invoke<boolean>("check_biometric_available").then(setBioAvailable).catch(() => setBioAvailable(false));
  }, []);

  useEffect(() => {
    if (enabling) setTimeout(() => pwRef.current?.focus(), 50);
  }, [enabling]);

  async function handleEnable() {
    if (!vault) return;
    setEnableLoading(true);
    setEnableError("");
    try {
      await unlockVault(vault.encryptedData, enablePw);
    } catch {
      setEnableError("WRONG PASSWORD");
      setEnableLoading(false);
      return;
    }
    const pw = enablePw;
    setEnablePw(""); // clear from React state before handing off to biometric system
    try {
      await invoke("enable_biometric", { vaultId: vault.id, password: pw });
      updateSettings({ biometricVaultIds: [...biometricVaultIds, vault.id] });
      setEnabling(false);
    } catch (e) {
      setEnableError(`SECURE STORAGE FAILED: ${e}`);
    } finally {
      setEnableLoading(false);
    }
  }

  async function handleDisable() {
    if (!vault) return;
    try {
      await invoke("disable_biometric", { vaultId: vault.id });
    } catch {
      // keyring entry may already be gone
    }
    updateSettings({ biometricVaultIds: biometricVaultIds.filter((id) => id !== vault.id) });
  }

  function setLockTimeout(minutes: number) {
    updateSettings({ autoLockMinutes: minutes });
    invoke("set_lock_timeout", { minutes }).catch(() => {});
  }

  function toggleWindowBlur() {
    updateSettings({ lockOnWindowBlur: !lockOnWindowBlur });
  }

  const statusBar = <ScreenHeader title="Security" onBack={() => navigate("/settings")} />;

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

      {/* Auto-lock timeout */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
            Auto-lock timeout
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
            Lock after this much idle time
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {TIMEOUT_OPTIONS.map((opt) => {
            const isSelected = opt.value === autoLockMinutes;
            return (
              <button
                key={opt.value}
                onClick={() => setLockTimeout(opt.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "var(--space-3) var(--space-4)",
                  background: "none",
                  border: `1px solid ${isSelected ? "var(--color-text-display)" : "var(--color-border-strong)"}`,
                  borderRadius: "var(--radius-sharp)",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: isSelected ? "var(--color-text-display)" : "var(--color-text-primary)" }}>
                  {opt.label}
                </span>
                {isSelected && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-display)", letterSpacing: "0.05em" }}>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lock on sleep */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <button
          onClick={() => updateSettings({ lockOnSleep: !lockOnSleep })}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            padding: "var(--space-4)",
            background: "none",
            border: `1px solid ${lockOnSleep ? "var(--color-text-display)" : "var(--color-border-strong)"}`,
            borderRadius: "var(--radius-sharp)",
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
              Lock on sleep
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
              Lock when the screen locks or machine sleeps
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: lockOnSleep ? "var(--color-text-display)" : "var(--color-text-disabled)", letterSpacing: "0.05em", flexShrink: 0 }}>
            {lockOnSleep ? "[ON]" : "[OFF]"}
          </span>
        </button>
      </div>

      {/* Window blur */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <button
          onClick={toggleWindowBlur}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            padding: "var(--space-4)",
            background: "none",
            border: `1px solid ${lockOnWindowBlur ? "var(--color-text-display)" : "var(--color-border-strong)"}`,
            borderRadius: "var(--radius-sharp)",
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
              Lock on window blur
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
              Lock immediately when the app loses focus
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: lockOnWindowBlur ? "var(--color-text-display)" : "var(--color-text-disabled)", letterSpacing: "0.05em", flexShrink: 0 }}>
            {lockOnWindowBlur ? "[ON]" : "[OFF]"}
          </span>
        </button>
        {lockOnWindowBlur && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em" }}>
            [PARANOID MODE — app locks every time you switch windows]
          </div>
        )}
      </div>

      {/* Clipboard clear timeout */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
            Clipboard clear timeout
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
            Automatically clear copied addresses after this time
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {CLIPBOARD_OPTIONS.map((opt) => {
            const isSelected = opt.value === clipboardClearSeconds;
            return (
              <button
                key={opt.value}
                onClick={() => updateSettings({ clipboardClearSeconds: opt.value })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "var(--space-3) var(--space-4)",
                  background: "none",
                  border: `1px solid ${isSelected ? "var(--color-text-display)" : "var(--color-border-strong)"}`,
                  borderRadius: "var(--radius-sharp)",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: isSelected ? "var(--color-text-display)" : "var(--color-text-primary)" }}>
                  {opt.label}
                </span>
                {isSelected && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-display)", letterSpacing: "0.05em" }}>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Biometric unlock */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
            Biometric unlock
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
            Use Touch ID or Windows Hello to unlock vaults
          </div>
        </div>

        {bioAvailable === null && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            [CHECKING...]
          </span>
        )}

        {bioAvailable === false && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            [NOT AVAILABLE ON THIS DEVICE]
          </span>
        )}

        {bioAvailable === true && !vault && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            [NO VAULT SELECTED]
          </span>
        )}

        {bioAvailable === true && vault && !bioEnabled && !enabling && (
          <button
            onClick={() => setEnabling(true)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--space-3) var(--space-4)",
              background: "none",
              border: "1px solid var(--color-border-strong)",
              borderRadius: "var(--radius-sharp)",
              cursor: "pointer",
              width: "100%",
            }}
          >
            <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-primary)" }}>
              Enable for {vault.name}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
              [OFF]
            </span>
          </button>
        )}

        {enabling && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-4)", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sharp)" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
              Confirm your vault password to enable biometric unlock
            </div>
            <input
              ref={pwRef}
              type="password"
              autoComplete="new-password"
              value={enablePw}
              onChange={(e) => setEnablePw(e.target.value)}
              placeholder="••••••••••"
              onKeyDown={(e) => e.key === "Enter" && handleEnable()}
              className="sigil-input"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-mono-sm)",
                color: "var(--color-text-primary)",
                background: "var(--color-bg-elevated)",
                borderRadius: "var(--radius-sharp)",
                padding: "var(--space-3) var(--space-4)",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            {enableError && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
                {enableError}
              </span>
            )}
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                onClick={handleEnable}
                disabled={enableLoading || !enablePw}
                style={{
                  flex: 1,
                  padding: "var(--space-3)",
                  background: "none",
                  border: "1px solid var(--color-text-display)",
                  borderRadius: "var(--radius-sharp)",
                  cursor: enableLoading || !enablePw ? "default" : "pointer",
                  opacity: enableLoading || !enablePw ? 0.4 : 1,
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-mono-sm)",
                  color: "var(--color-text-display)",
                  letterSpacing: "0.05em",
                }}
              >
                {enableLoading ? "[SAVING...]" : "[CONFIRM]"}
              </button>
              <button
                onClick={() => { setEnabling(false); setEnablePw(""); setEnableError(""); }}
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  background: "none",
                  border: "1px solid var(--color-border-strong)",
                  borderRadius: "var(--radius-sharp)",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-mono-sm)",
                  color: "var(--color-text-secondary)",
                  letterSpacing: "0.05em",
                }}
              >
                [CANCEL]
              </button>
            </div>
          </div>
        )}

        {bioAvailable === true && vault && bioEnabled && (
          <button
            onClick={handleDisable}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--space-3) var(--space-4)",
              background: "none",
              border: "1px solid var(--color-text-display)",
              borderRadius: "var(--radius-sharp)",
              cursor: "pointer",
              width: "100%",
            }}
          >
            <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-display)" }}>
              Enabled for {vault.name}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em" }}>
              [DISABLE]
            </span>
          </button>
        )}
      </div>

    </AppShell>
  );
}
