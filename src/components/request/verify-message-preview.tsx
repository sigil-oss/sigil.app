import { useState, useMemo } from "react";
import { Button } from "@/components/button";
import { k12, verify, publicKeyToIdentity } from "@qubic.org/crypto";
import { truncateId } from "@/lib/format";
import { useSessionStore } from "@/store/session";

export interface VerifyMessageRequest {
  message: string;
  data?: string; // base64-encoded raw bytes; if absent, hashes message UTF-8 bytes
  signature: string; // base64-encoded 64-byte SchnorrQ signature
  public_key: string; // base64-encoded 32-byte public key
  [key: string]: unknown;
}

export interface VerifyMessageResult {
  valid: boolean;
  identity: string;
}

interface VerifyMessagePreviewProps {
  request: VerifyMessageRequest;
  onApprove: (result: VerifyMessageResult) => void;
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

export function VerifyMessagePreview({ request, onApprove, onReject }: VerifyMessagePreviewProps) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const wallets = useSessionStore((s) => s.wallets);

  const publicKeyBytes = useMemo(() => base64ToBytes(request.public_key), [request.public_key]);

  const claimedIdentity = useMemo(() => {
    try {
      return publicKeyToIdentity(publicKeyBytes) as string;
    } catch {
      return null;
    }
  }, [publicKeyBytes]);

  const isOwnIdentity = claimedIdentity !== null && wallets.some((w) => w.identity === claimedIdentity);

  async function handleVerify() {
    setProcessing(true);
    setError("");
    try {
      const messageBytes = request.data
        ? base64ToBytes(request.data)
        : new TextEncoder().encode(request.message);
      const digest = k12(messageBytes, 32);
      const signatureBytes = base64ToBytes(request.signature);
      const valid = verify(digest, signatureBytes, publicKeyBytes);
      onApprove({ valid, identity: claimedIdentity ?? "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
      setProcessing(false);
    }
  }

  const invalidKey = claimedIdentity === null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em" }}>
        [OFF-CHAIN — SIGNATURE VERIFICATION ONLY]
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
          maxHeight: 160,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          padding: "var(--space-3)",
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-sharp)",
        }}>
          {request.message}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <Row
          label="Claimed signer"
          value={invalidKey ? "[INVALID PUBLIC KEY]" : truncateId(claimedIdentity!, 10, 10)}
          valueColor={invalidKey ? "var(--color-status-error)" : undefined}
          badge={!invalidKey ? (isOwnIdentity ? "[YOUR WALLET]" : "[EXTERNAL]") : undefined}
        />
        <Row label="Signature" value={truncateId(request.signature, 10, 10)} />
      </div>

      {invalidKey && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
          [CANNOT VERIFY — INVALID PUBLIC KEY]
        </div>
      )}

      {error && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
          [{error}]
        </div>
      )}

      <Button onClick={handleVerify} loading={processing} disabled={invalidKey}>
        Verify & respond
      </Button>
      <Button variant="danger" shape="sharp" onClick={onReject}>
        Reject
      </Button>
    </div>
  );
}

function Row({ label, value, valueColor, badge }: { label: string; value: string; valueColor?: string; badge?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-1)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: valueColor ?? "var(--color-text-primary)", letterSpacing: "0.05em", textAlign: "right", wordBreak: "break-all" }}>
          {value}
        </span>
        {badge && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
