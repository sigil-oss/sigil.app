import { useState } from "react";
import { Button } from "@/components/button";
import { useSessionStore } from "@/store/session";
import { usePersistedStore } from "@/store/persisted";
import { useSigningAccount } from "@/hooks/use-signing-account";
import { k12, sign } from "@qubic.org/crypto";
import { truncateId } from "@/lib/format";

export interface SignMessageRequest {
  message: string;
  from?: string;
  data?: string; // base64-encoded raw bytes to sign; if absent, signs message UTF-8 bytes
  [key: string]: unknown;
}

export interface SignMessageApproveResult {
  signature: string; // base64-encoded 64-byte SchnorrQ signature
  publicKey: string; // base64-encoded 32-byte public key
  identity: string;
}

interface SignMessagePreviewProps {
  request: SignMessageRequest;
  onApprove: (result: SignMessageApproveResult) => void;
  onReject: () => void;
}

function base64ToBytes(b64: string): Uint8Array {
  try {
    const binary = atob(b64);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return new Uint8Array(0);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function SignMessagePreview({ request, onApprove, onReject }: SignMessagePreviewProps) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const seeds = useSessionStore((s) => s.seeds);
  const { wallet, accountName, fromError, selectedIndex, setSelectedIndex, showPicker } =
    useSigningAccount(request.from);
  const vault = usePersistedStore((s) =>
    s.vaults.find((v) => v.id === s.settings.activeVaultId)
  );

  const seed = seeds[selectedIndex] ?? null;

  async function approve() {
    if (!seed || !wallet) return;
    setProcessing(true);
    setError("");
    try {
      const messageBytes = request.data
        ? base64ToBytes(request.data)
        : new TextEncoder().encode(request.message);
      // SchnorrQ signs a 32-byte digest; k12 matches the hashing Qubic uses elsewhere
      const digest = k12(messageBytes, 32);
      const signatureBytes = await sign(digest, seed);
      onApprove({
        signature: bytesToBase64(signatureBytes),
        publicKey: bytesToBase64(wallet.publicKey),
        identity: wallet.identity,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing failed.");
      setProcessing(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em" }}>
        [OFF-CHAIN — NO TRANSACTION WILL BE BROADCAST]
      </div>

      <div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
          Message
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-mono-sm)",
          color: "var(--color-text-primary)",
          letterSpacing: "0.05em",
          lineHeight: 1.7,
          maxHeight: 180,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          padding: "var(--space-3)",
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-sharp)",
        }}>
          {request.message.length > 2000
            ? `${request.message.slice(0, 2000)}\n\n[… ${request.message.length.toLocaleString()} chars total]`
            : request.message}
        </div>
      </div>

      {/* Account picker (shown when dApp didn't specify `from`) */}
      {showPicker && vault && (
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
            Sign as
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {vault.accounts.filter((a) => !a.hidden).map((acc) => (
              <button
                key={acc.index}
                onClick={() => setSelectedIndex(acc.index)}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)",
                  letterSpacing: "0.05em", padding: "var(--space-1) var(--space-3)",
                  borderRadius: "var(--radius-pill)",
                  border: `1px solid ${acc.index === selectedIndex ? "var(--color-text-display)" : "var(--color-border-strong)"}`,
                  background: acc.index === selectedIndex ? "var(--color-text-display)" : "transparent",
                  color: acc.index === selectedIndex ? "var(--color-bg-base)" : "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                {acc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {fromError ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
          [{fromError}]
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
            From
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em", textAlign: "right", wordBreak: "break-all" }}>
            {accountName} · {truncateId(wallet?.identity ?? "", 10, 10)}
          </span>
        </div>
      )}

      {error && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
          [{error}]
        </div>
      )}

      <Button onClick={approve} loading={processing} disabled={!seed || !wallet || !!fromError}>
        Sign message
      </Button>
      <Button variant="danger" shape="sharp" onClick={onReject}>
        Reject
      </Button>
    </div>
  );
}
