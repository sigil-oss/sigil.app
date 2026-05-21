import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { usePersistedStore } from "@/store/persisted";
import { notify, requestNotificationPermission } from "@/lib/notifications";

function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => !disabled && onChange(!value)}
      style={{
        width: 38,
        height: 22,
        borderRadius: 11,
        background: value && !disabled ? "var(--color-status-success)" : "var(--color-bg-elevated)",
        border: `1px solid ${value && !disabled ? "var(--color-status-success)" : "var(--color-border-strong)"}`,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.35 : 1,
        padding: 0,
        position: "relative",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "var(--color-text-display)",
          position: "absolute",
          top: 2,
          left: value ? 18 : 2,
          transition: "left 0.12s",
        }}
      />
    </button>
  );
}

function SettingRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-4)",
        padding: "var(--space-4)",
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-sharp)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-body)",
            fontWeight: 500,
            color: "var(--color-text-primary)",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-label)",
            color: "var(--color-text-secondary)",
            marginTop: "var(--space-1)",
          }}
        >
          {description}
        </div>
      </div>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export default function NotificationsScreen() {
  const navigate = useNavigate();

  const enabled = usePersistedStore((s) => s.settings.notificationsEnabled);
  const onReceived = usePersistedStore((s) => s.settings.notifyOnReceived);
  const onSent = usePersistedStore((s) => s.settings.notifyOnSent);
  const onConfirmed = usePersistedStore((s) => s.settings.notifyOnConfirmed);
  const updateSettings = usePersistedStore((s) => s.updateSettings);

  const [permDenied, setPermDenied] = useState(false);

  async function handleToggleEnabled(v: boolean) {
    if (v) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        setPermDenied(true);
        return;
      }
      setPermDenied(false);
    }
    updateSettings({ notificationsEnabled: v });
  }

  async function sendTest() {
    await notify("Sigil · Test", "Desktop notifications are working");
  }

  const statusBar = <ScreenHeader title="Notifications" onBack={() => navigate("/settings")} />;

  return (
    <AppShell
      statusBar={statusBar}
      contentStyle={{
        padding: "var(--space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      {/* Master toggle */}
      <SettingRow
        label="Desktop notifications"
        description="Show OS notifications for wallet events"
        value={enabled}
        onChange={handleToggleEnabled}
      />

      {permDenied && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-mono-sm)",
            color: "var(--color-status-error)",
            letterSpacing: "0.05em",
          }}
        >
          [PERMISSION DENIED — allow notifications in your OS settings]
        </div>
      )}

      {/* Per-event toggles */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          marginTop: "var(--space-2)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-mono-sm)",
            color: "var(--color-text-disabled)",
            letterSpacing: "0.05em",
            marginBottom: "var(--space-1)",
          }}
        >
          NOTIFY WHEN
        </div>

        <SettingRow
          label="QU received"
          description="Balance increases detected from polling"
          value={onReceived}
          onChange={(v) => updateSettings({ notifyOnReceived: v })}
          disabled={!enabled}
        />
        <SettingRow
          label="Transaction sent"
          description="Any send, SC call, or burn is broadcast"
          value={onSent}
          onChange={(v) => updateSettings({ notifyOnSent: v })}
          disabled={!enabled}
        />
        <SettingRow
          label="Transaction resolved"
          description="Pending tx confirms on chain or expires"
          value={onConfirmed}
          onChange={(v) => updateSettings({ notifyOnConfirmed: v })}
          disabled={!enabled}
        />
      </div>

      {/* Test button */}
      <button
        onClick={sendTest}
        disabled={!enabled}
        style={{
          marginTop: "var(--space-4)",
          background: "none",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-sharp)",
          padding: "var(--space-3)",
          cursor: enabled ? "pointer" : "default",
          opacity: enabled ? 1 : 0.35,
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-mono-sm)",
          color: "var(--color-text-secondary)",
          letterSpacing: "0.05em",
          width: "100%",
        }}
      >
        SEND TEST NOTIFICATION
      </button>

      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-caption)",
          color: "var(--color-text-disabled)",
          marginTop: "var(--space-2)",
          lineHeight: 1.5,
        }}
      >
        Received detection relies on balance polling (every 5s). Notifications
        only fire while Sigil is running — background monitoring is not supported.
      </div>
    </AppShell>
  );
}
