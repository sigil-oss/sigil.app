import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { IdentityDisplay } from "@/components/identity-display";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useAutoLock } from "@/hooks/use-auto-lock";

export default function ReceiveScreen() {
  const navigate = useNavigate();
  useAutoLock();

  const settings = usePersistedStore((s) => s.settings);
  const vault = usePersistedStore((s) => s.vaults.find((v) => v.id === s.settings.activeVaultId));
  const wallets = useSessionStore((s) => s.wallets);

  const activeIndex = settings.activeAccountIndex;
  const wallet = wallets[activeIndex] ?? null;
  const identity = wallet?.identity ?? null;
  const accountName = vault?.accounts[activeIndex]?.name ?? `Account ${activeIndex + 1}`;

  const statusBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <button onClick={() => navigate("/dashboard")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}>
        ← BACK
      </button>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Your address
      </span>
      <span style={{ width: 40 }} />
    </div>
  );

  return (
    <AppShell statusBar={statusBar} contentStyle={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-8)" }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {accountName}
      </div>

      {identity ? (
        <>
          <div style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-sharp)",
            padding: "var(--space-4)",
          }}>
            <QRCodeSVG
              value={identity}
              size={200}
              bgColor="transparent"
              fgColor="var(--color-text-display)"
              level="M"
            />
          </div>

          <IdentityDisplay identity={identity} style={{ textAlign: "center", maxWidth: 300 }} />
        </>
      ) : (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
          [NO ACCOUNT]
        </span>
      )}
    </AppShell>
  );
}
