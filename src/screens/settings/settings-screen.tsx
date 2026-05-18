import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/layouts/app-shell";
import { useAutoLock } from "@/hooks/use-auto-lock";

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
  { label: "Appearance", description: "Theme, hide balances, currency", route: "/settings/appearance", available: true },
];

export default function SettingsScreen() {
  const navigate = useNavigate();
  useAutoLock();

  const statusBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Settings
      </span>
    </div>
  );

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
    </AppShell>
  );
}
