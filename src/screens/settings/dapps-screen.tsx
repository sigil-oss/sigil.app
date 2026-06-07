import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import type { ApprovedDapp } from "@/store/persisted";
import { truncateId } from "@/lib/format";

const PERMISSION_LABELS: Record<string, string> = {
  transfer: "Transfer QU",
  sc_call: "Contract calls",
  sign_message: "Sign messages",
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function DappsScreen() {
  const navigate = useNavigate();

  const approvedDapps = usePersistedStore((s) => s.settings.approvedDapps);
  const revokeDapp = usePersistedStore((s) => s.revokeDapp);
  const revokeDappPermission = usePersistedStore((s) => s.revokeDappPermission);
  const setDappAllowedIdentities = usePersistedStore((s) => s.setDappAllowedIdentities);
  const wallets = useSessionStore((s) => s.wallets);

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const statusBar = <ScreenHeader title="Approved dApps" onBack={() => navigate("/settings")} />;

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {approvedDapps.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-3)", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", textAlign: "center" }}>
          <div>[NO APPROVED DAPPS]</div>
          <div>[DEEP-LINK TRUST IS DISABLED UNTIL REQUEST ORIGINS CAN BE AUTHENTICATED.]</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          {approvedDapps.map((dapp) => (
            <DappCard
              key={dapp.origin}
              dapp={dapp}
              walletIdentities={wallets.map((w) => w.identity)}
              confirmingRemove={confirmRemove === dapp.origin}
              onRevokePermission={(p) => revokeDappPermission(dapp.origin, p)}
              onSetAllowedIdentities={(ids) => setDappAllowedIdentities(dapp.origin, ids)}
              onRemove={() => setConfirmRemove(dapp.origin)}
              onConfirmRemove={() => { revokeDapp(dapp.origin); setConfirmRemove(null); }}
              onCancelRemove={() => setConfirmRemove(null)}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

interface DappCardProps {
  dapp: ApprovedDapp;
  walletIdentities: string[];
  confirmingRemove: boolean;
  onRevokePermission: (p: ApprovedDapp["permissions"][number]) => void;
  onSetAllowedIdentities: (ids: string[] | undefined) => void;
  onRemove: () => void;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
}

function DappCard({ dapp, walletIdentities, confirmingRemove, onRevokePermission, onSetAllowedIdentities, onRemove, onConfirmRemove, onCancelRemove }: DappCardProps) {
  const [showAccountScope, setShowAccountScope] = useState(false);

  const allowedSet = new Set(dapp.allowedIdentities ?? []);
  const isRestricted = (dapp.allowedIdentities?.length ?? 0) > 0;

  function toggleIdentity(id: string) {
    const next = new Set(allowedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSetAllowedIdentities(next.size > 0 ? [...next] : undefined);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", padding: "var(--space-4)", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sharp)" }}>
      {/* Header */}
      <div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
          {dapp.name}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", marginTop: "var(--space-1)" }}>
          {dapp.origin}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", marginTop: "var(--space-1)" }}>
          Approved {formatDate(dapp.approvedAt)}
        </div>
      </div>

      {/* Permissions */}
      {dapp.permissions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Permissions
          </div>
          {dapp.permissions.map((p) => (
            <div key={p} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em" }}>
                {PERMISSION_LABELS[p] ?? p}
              </span>
              <button
                onClick={() => onRevokePermission(p)}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em", padding: 0 }}
              >
                REVOKE
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Account scope */}
      {walletIdentities.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Account access
              {isRestricted && (
                <span style={{ marginLeft: "var(--space-2)", fontFamily: "var(--font-mono)", fontSize: "var(--text-label)", color: "var(--color-status-warning)" }}>
                  [{dapp.allowedIdentities!.length}/{walletIdentities.length}]
                </span>
              )}
            </div>
            <button
              onClick={() => setShowAccountScope((v) => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}
            >
              {showAccountScope ? "HIDE" : "EDIT"}
            </button>
          </div>

          {!showAccountScope && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
              {isRestricted ? `Restricted to ${dapp.allowedIdentities!.length} account(s)` : "All accounts"}
            </div>
          )}

          {showAccountScope && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {walletIdentities.map((id) => {
                const allowed = !isRestricted || allowedSet.has(id);
                return (
                  <div
                    key={id}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-2) var(--space-3)", border: `1px solid ${allowed ? "var(--color-status-success)" : "var(--color-border-strong)"}`, borderRadius: "var(--radius-sharp)", cursor: "pointer" }}
                    onClick={() => toggleIdentity(id)}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: allowed ? "var(--color-text-primary)" : "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                      {truncateId(id, 8, 6)}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: allowed ? "var(--color-status-success)" : "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                      {allowed ? "ALLOWED" : "BLOCKED"}
                    </span>
                  </div>
                );
              })}
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-label)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                Toggle accounts to restrict dApp access. Unlocked vault accounts only.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Remove */}
      {confirmingRemove ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
            Remove this dApp? Future requests will show as first time.
          </div>
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <button
              onClick={onConfirmRemove}
              style={{ background: "none", border: "1px solid var(--color-status-error)", borderRadius: "var(--radius-sharp)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em", padding: "var(--space-1) var(--space-3)" }}
            >
              REMOVE
            </button>
            <button
              onClick={onCancelRemove}
              style={{ background: "none", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sharp)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: "var(--space-1) var(--space-3)" }}
            >
              CANCEL
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onRemove}
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em", padding: 0, textAlign: "left" }}
        >
          Remove dApp
        </button>
      )}
    </div>
  );
}
