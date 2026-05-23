import { useState } from "react";
import { Button } from "@/components/button";
import { useSessionStore } from "@/store/session";
import { usePersistedStore } from "@/store/persisted";
import { truncateId } from "@/lib/format";

export interface ConnectRequest {
  permissions?: ("transfer" | "sc_call" | "sign_message")[];
  [key: string]: unknown;
}

export interface ConnectApproveResult {
  identity: string;
  permissions: ("transfer" | "sc_call" | "sign_message")[];
}

interface ConnectPreviewProps {
  dappName: string;
  dappOrigin: string;
  request: ConnectRequest;
  onApprove: (result: ConnectApproveResult) => void;
  onReject: () => void;
}

const PERMISSION_LABELS: Record<string, string> = {
  transfer: "Transfer QU",
  sc_call: "Contract calls",
  sign_message: "Sign messages",
};

export function ConnectPreview({ dappName, dappOrigin, request, onApprove, onReject }: ConnectPreviewProps) {
  const wallets = useSessionStore((s) => s.wallets);
  const settings = usePersistedStore((s) => s.settings);
  const vault = usePersistedStore((s) => s.vaults.find((v) => v.id === s.settings.activeVaultId));

  const [selectedIndex, setSelectedIndex] = useState(settings.activeAccountIndex);

  const requestedPerms = request.permissions ?? [];
  const [grantedPerms, setGrantedPerms] = useState<Set<string>>(() => new Set(requestedPerms));

  const selectedWallet = wallets[selectedIndex] ?? null;

  function togglePerm(p: string) {
    setGrantedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }

  function approve() {
    if (!selectedWallet) return;
    const permissions = requestedPerms.filter((p) => grantedPerms.has(p)) as ("transfer" | "sc_call" | "sign_message")[];
    onApprove({ identity: selectedWallet.identity, permissions });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-primary)" }}>
        This dApp wants to know your identity.
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em" }}>
        [{dappName || dappOrigin} IS UNVERIFIED. SIGIL DOES NOT PERSIST TRUST FOR DEEP-LINK ORIGINS.]
      </div>

      {/* Account picker */}
      <div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
          Reveal account
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {wallets.map((w, i) => {
            const account = vault?.accounts[i];
            if (!account) return null;
            const isSelected = i === selectedIndex;
            return (
              <button
                key={i}
                onClick={() => setSelectedIndex(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-4)",
                  padding: "var(--space-3)",
                  background: isSelected ? "var(--color-bg-surface)" : "none",
                  border: `1px solid ${isSelected ? "var(--color-text-display)" : "var(--color-border-strong)"}`,
                  borderRadius: "var(--radius-sharp)",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)" }}>
                  {account.name}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                  {truncateId(w.identity, 10, 10)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Requested permissions — user can deselect individual permissions */}
      {requestedPerms.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
              Permissions requested
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {requestedPerms.map((p) => {
                const granted = grantedPerms.has(p);
                return (
                  <button
                    key={p}
                    onClick={() => togglePerm(p)}
                    style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: granted ? "var(--color-text-display)" : "var(--color-text-disabled)", letterSpacing: "0.05em", minWidth: 20 }}>
                      {granted ? "[✓]" : "[ ]"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: granted ? "var(--color-text-primary)" : "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                      {PERMISSION_LABELS[p] ?? p}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
            Each action will show a confirmation screen. Nothing is signed without your approval.
          </div>
        </div>
      )}

      <Button onClick={approve} disabled={!selectedWallet}>
        Connect
      </Button>
      <Button variant="danger" shape="sharp" onClick={onReject}>
        Reject
      </Button>
    </div>
  );
}
