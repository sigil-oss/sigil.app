import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { IdentityDisplay } from "@/components/identity-display";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { getVaultAccountIdentity } from "@/lib/accounts";

export default function ReceiveScreen() {
  const navigate = useNavigate();

  const settings = usePersistedStore((s) => s.settings);
  const vault = usePersistedStore((s) => s.vaults.find((v) => v.id === s.settings.activeVaultId));
  const wallets = useSessionStore((s) => s.wallets);

  const activeIndex = settings.activeAccountIndex;
  const identity = getVaultAccountIdentity(vault ?? null, activeIndex, wallets);
  const accountName = vault?.accounts[activeIndex]?.name ?? `Account ${activeIndex + 1}`;
  const hideBalances = settings.hideBalances;
  const [qrRevealed, setQrRevealed] = useState(false);

  const statusBar = <ScreenHeader title="Your address" onBack={() => navigate("/dashboard")} backAriaLabel="Go back" />;

  return (
    <AppShell statusBar={statusBar} contentStyle={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-8)" }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {accountName}
      </div>

      {identity ? (
        <>
          <div
            role={hideBalances ? "button" : undefined}
            tabIndex={hideBalances ? 0 : undefined}
            aria-label={hideBalances ? (qrRevealed ? "Hide QR code" : "Reveal QR code") : undefined}
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: "var(--radius-sharp)",
              padding: "var(--space-4)",
              position: "relative",
              cursor: hideBalances && !qrRevealed ? "pointer" : "default",
            }}
            onMouseEnter={() => hideBalances && setQrRevealed(true)}
            onMouseLeave={() => hideBalances && setQrRevealed(false)}
            onClick={() => hideBalances && setQrRevealed((v) => !v)}
            onKeyDown={(e) => { if (hideBalances && (e.key === "Enter" || e.key === " ")) setQrRevealed((v) => !v); }}
          >
            <QRCodeSVG
              value={identity}
              size={200}
              bgColor="#FFFFFF"
              fgColor="#111111"
              level="M"
              aria-label={`QR code for address ${identity}`}
              role="img"
              includeMargin
              style={{ display: "block", filter: hideBalances && !qrRevealed ? "blur(12px)" : "none", transition: "filter 0.15s ease" }}
            />
            {hideBalances && !qrRevealed && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                  TAP OR HOVER TO REVEAL
                </span>
              </div>
            )}
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
