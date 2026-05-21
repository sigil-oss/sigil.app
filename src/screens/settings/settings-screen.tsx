import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { useUpdater } from "@/hooks/use-updater";

interface SettingsRow {
  label: string;
  description: string;
  route: string;
  available: boolean;
}

const ROWS: SettingsRow[] = [
  { label: "Approved dApps", description: "Manage dApp permissions and access", route: "/settings/dapps", available: true },
  { label: "Security", description: "Auto-lock, biometric unlock", route: "/settings/security", available: true },
  { label: "Network", description: "RPC endpoints, network selection", route: "/settings/network", available: true },
  { label: "Appearance", description: "Theme, fonts, accent color, custom scheme", route: "/settings/appearance", available: true },
  { label: "Contacts", description: "Add, edit, import and export contacts", route: "/settings/contacts", available: true },
  { label: "Notifications", description: "Desktop alerts for received, sent, confirmed", route: "/settings/notifications", available: true },
  { label: "Support", description: "Sponsors, donate QU, GitHub", route: "/settings/support", available: true },
];

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { appVersion, update, checking, upToDate, checkError, installing, progress, install } = useUpdater();

  const statusBar = <ScreenHeader title="Settings" onBack={() => navigate("/dashboard")} />;

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {ROWS.map((row) => (
        <button
          key={row.route}
          onClick={() => row.available && navigate(row.route)}
          disabled={!row.available}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            padding: "var(--space-4)",
            background: "none",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-sharp)",
            cursor: row.available ? "pointer" : "default",
            textAlign: "left",
            width: "100%",
            opacity: row.available ? 1 : 0.4,
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
              {row.label}
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
              {row.description}
            </div>
          </div>
          {row.available && (
            <ChevronRight size={14} color="var(--color-text-secondary)" strokeWidth={1.5} style={{ flexShrink: 0 }} />
          )}
        </button>
      ))}

      {/* Version + update footer */}
      <div style={{ marginTop: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {update && (
          <button
            onClick={install}
            disabled={installing}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--space-3) var(--space-4)",
              background: "none",
              border: "1px solid var(--color-status-success)",
              borderRadius: "var(--radius-sharp)",
              cursor: installing ? "default" : "pointer",
              width: "100%",
              opacity: installing ? 0.6 : 1,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-success)", letterSpacing: "0.05em" }}>
              {installing
                ? progress > 0 ? `[DOWNLOADING... ${progress}%]` : "[DOWNLOADING...]"
                : `[UPDATE AVAILABLE v${update.version}]`}
            </span>
            {!installing && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-success)", letterSpacing: "0.05em" }}>
                INSTALL →
              </span>
            )}
          </button>
        )}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: checkError ? "var(--color-status-error)" : "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
          {appVersion ? `v${appVersion}` : ""}
          {checking ? " [CHECKING...]" : ""}
          {upToDate ? " [UP TO DATE]" : ""}
          {checkError ? " [UPDATE CHECK FAILED]" : ""}
        </span>
      </div>
    </AppShell>
  );
}
