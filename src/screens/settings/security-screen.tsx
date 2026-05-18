import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { AppShell } from "@/layouts/app-shell";
import { usePersistedStore } from "@/store/persisted";
import { useAutoLock } from "@/hooks/use-auto-lock";

const TIMEOUT_OPTIONS: { label: string; value: number }[] = [
  { label: "1 minute", value: 1 },
  { label: "5 minutes", value: 5 },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "Never", value: 0 },
];

export default function SecurityScreen() {
  const navigate = useNavigate();
  useAutoLock();

  const autoLockMinutes = usePersistedStore((s) => s.settings.autoLockMinutes);
  const lockOnWindowBlur = usePersistedStore((s) => s.settings.lockOnWindowBlur);
  const updateSettings = usePersistedStore((s) => s.updateSettings);

  function setLockTimeout(minutes: number) {
    updateSettings({ autoLockMinutes: minutes });
    invoke("set_lock_timeout", { minutes }).catch(() => {});
  }

  function toggleWindowBlur() {
    updateSettings({ lockOnWindowBlur: !lockOnWindowBlur });
  }

  const statusBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <button
        onClick={() => navigate("/settings")}
        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}
      >
        ← BACK
      </button>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Security
      </span>
      <span style={{ width: 40 }} />
    </div>
  );

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

    </AppShell>
  );
}
