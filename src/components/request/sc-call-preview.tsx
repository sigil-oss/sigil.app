import { useState, useMemo } from "react";
import { Button } from "@/components/button";
import { usePersistedStore } from "@/store/persisted";
import { useSigningAccount } from "@/hooks/use-signing-account";
import { useTickInfo } from "@/hooks/use-tick-info";
import { useBalance } from "@/hooks/use-balance";
import { estimateTargetTick, getRpcClient } from "@/lib/rpc";
import { contractIndexToIdentity, publicKeyToIdentity } from "@qubic.org/crypto";
import type { Identity } from "@qubic.org/types";
import {
  Q_UTIL_CONTRACT_INDEX,
  Q_UTIL_SEND_TO_MANY_V1_INPUT_TYPE,
  QEARN_CONTRACT_INDEX,
  QEARN_LOCK_INPUT_TYPE,
  CONTRACT_NAMES,
  CONTRACT_PROCEDURE_NAMES,
} from "@/lib/contracts";
import { QEARN_UNLOCK_INPUT_TYPE } from "@qubic.org/contracts";
import type { ApproveResult } from "./transfer-preview";

export interface ScCallRequest {
  contract_index: number;
  input_type: number;
  from?: string;
  amount?: number;
  payload?: string; // base64-encoded binary
  tick_offset?: number;
  [key: string]: unknown;
}

interface ScCallPreviewProps {
  request: ScCallRequest;
  onApprove: (result: ApproveResult) => void;
  onReject: () => void;
}


function formatAmount(n: number | bigint): string {
  return Number(n).toLocaleString();
}

function base64ToHex(b64: string): string {
  try {
    const binary = atob(b64);
    return Array.from(binary, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
  } catch {
    return "[invalid payload]";
  }
}

function base64ToBytes(b64: string): Uint8Array {
  try {
    const binary = atob(b64);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return new Uint8Array(0);
  }
}

// Decode QUtil SendToManyV1 payload: 25×32-byte pubkeys + 25×8-byte uint64 amounts (LE)
function decodeQUtilSendToMany(bytes: Uint8Array): { identity: string; amount: bigint }[] | null {
  if (bytes.length < 800 + 200) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const results: { identity: string; amount: bigint }[] = [];
  for (let i = 0; i < 25; i++) {
    const pubKey = bytes.slice(i * 32, (i + 1) * 32);
    const amountOffset = 800 + i * 8;
    const lo = view.getUint32(amountOffset, true);
    const hi = view.getUint32(amountOffset + 4, true);
    const amount = (BigInt(hi) << 32n) | BigInt(lo);
    if (amount === 0n) continue;
    try {
      const identity = publicKeyToIdentity(pubKey) as string;
      results.push({ identity, amount });
    } catch {
      // skip invalid entries
    }
  }
  return results;
}

// Decode Qearn UnlockInQearn payload: 8-byte uint64 amount + 4-byte uint32 epoch (LE)
function decodeQearnUnlock(bytes: Uint8Array): { amount: bigint; epoch: number } | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lo = view.getUint32(0, true);
  const hi = view.getUint32(4, true);
  const amount = (BigInt(hi) << 32n) | BigInt(lo);
  const epoch = view.getUint32(8, true);
  return { amount, epoch };
}

export function ScCallPreview({ request, onApprove, onReject }: ScCallPreviewProps) {
  const [processing, setProcessing] = useState(false);
  const [txError, setTxError] = useState("");
  const [showPayload, setShowPayload] = useState(false);

  const { wallet, accountName, fromError, selectedIndex, setSelectedIndex, showPicker } =
    useSigningAccount(request.from);
  const vaults = usePersistedStore((s) => s.vaults);
  const settings = usePersistedStore((s) => s.settings);
  const vault = vaults.find((v) => v.id === settings.activeVaultId);
  const addPendingTx = usePersistedStore((s) => s.addPendingTx);
  const pendingTxs = usePersistedStore((s) => s.pendingTxs);
  const { data: tickInfo } = useTickInfo();
  const { data: balanceData } = useBalance(wallet?.identity ?? null);

  const identity = wallet?.identity ?? "";
  const balance = balanceData?.balance ?? null;
  const hasPendingTx = pendingTxs.some((tx) => tx.source === identity);
  const hasAmount = (request.amount ?? 0) > 0;
  const insufficientBalance = hasAmount && balance !== null && BigInt(request.amount!) > balance;
  const tickOffset = request.tick_offset ?? 10;
  const targetTick = tickInfo ? estimateTargetTick(tickInfo.tick ?? 0, tickOffset) : null;
  const contractName = CONTRACT_NAMES[request.contract_index] ?? `Contract #${request.contract_index}`;
  const inputTypeLabel = CONTRACT_PROCEDURE_NAMES[`${request.contract_index}:${request.input_type}`] ?? `Procedure ${request.input_type}`;
  const destination: Identity = contractIndexToIdentity(request.contract_index);
  const payloadBytes = useMemo(
    () => (request.payload ? base64ToBytes(request.payload) : new Uint8Array(0)),
    [request.payload],
  );
  const payloadHex = request.payload ? base64ToHex(request.payload) : null;
  const payloadByteCount = payloadBytes.length;

  // Decoded views for known call types
  const decodedSendToMany = useMemo(() => {
    if (request.contract_index === Q_UTIL_CONTRACT_INDEX && request.input_type === Q_UTIL_SEND_TO_MANY_V1_INPUT_TYPE && payloadBytes.length > 0) {
      return decodeQUtilSendToMany(payloadBytes);
    }
    return null;
  }, [request.contract_index, request.input_type, payloadBytes]);

  const decodedQearnUnlock = useMemo(() => {
    if (request.contract_index === QEARN_CONTRACT_INDEX && request.input_type === QEARN_UNLOCK_INPUT_TYPE && payloadBytes.length > 0) {
      return decodeQearnUnlock(payloadBytes);
    }
    return null;
  }, [request.contract_index, request.input_type, payloadBytes]);

  const isQearnLock = request.contract_index === QEARN_CONTRACT_INDEX && request.input_type === QEARN_LOCK_INPUT_TYPE;

  async function approve() {
    if (!wallet || !tickInfo) return;
    setProcessing(true);
    setTxError("");
    try {
      const amount = BigInt(request.amount ?? 0);
      const tick = estimateTargetTick(tickInfo.tick ?? 0, tickOffset);

      const { encoded, hash } = await wallet.buildScTransaction({
        destination,
        inputType: request.input_type,
        payload: payloadBytes,
        amount,
        targetTick: tick,
        currentTick: tickInfo.tick,
      });

      const result = await getRpcClient().live.broadcastTransaction(encoded);
      if (!result.ok) throw result.error;

      addPendingTx({
        hash,
        source: identity,
        destination: destination as string,
        amount: amount.toString(),
        targetTick: tick,
        broadcastAt: Date.now(),
        contractName: `${contractName} · ${inputTypeLabel}`,
      });

      onApprove({ txHash: hash, targetTick: tick, identity });
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Broadcast failed.");
      setProcessing(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Contract — primary element */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "var(--text-display)", color: "var(--color-text-display)", letterSpacing: "-0.02em", lineHeight: 1 }}>
          {contractName}
        </div>
        <div style={{ marginTop: "var(--space-2)", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
          {inputTypeLabel}
        </div>
        {hasAmount && (
          <div style={{ marginTop: "var(--space-3)", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-text-secondary)" }}>
            {formatAmount(request.amount!)} QU
          </div>
        )}
      </div>

      {/* ── Decoded: QUtil SendToMany ── */}
      {decodedSendToMany && decodedSendToMany.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Recipients ({decodedSendToMany.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", maxHeight: 180, overflowY: "auto" }}>
            {decodedSendToMany.map((r) => (
              <div key={r.identity} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-4)", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.03em" }}>
                  {truncate(r.identity)}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                  {formatAmount(r.amount)} QU
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Decoded: Qearn Lock ── */}
      {isQearnLock && hasAmount && (
        <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", lineHeight: 1.6 }}>
          LOCK {formatAmount(request.amount!)} QU FOR STAKING
        </div>
      )}

      {/* ── Decoded: Qearn Unlock ── */}
      {decodedQearnUnlock && (
        <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", lineHeight: 1.6 }}>
          UNLOCK {formatAmount(decodedQearnUnlock.amount)} QU FROM EPOCH {decodedQearnUnlock.epoch}
        </div>
      )}

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

      {/* fromError: dApp specified an identity not in this vault */}
      {fromError && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
          [{fromError}]
        </div>
      )}

      {/* Detail rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {!fromError && <Row label="From" value={`${accountName} · ${truncate(identity)}`} />}
        <Row label="To" value={truncate(destination as string)} />
        {hasAmount && <Row label="Amount" value={`${formatAmount(request.amount!)} QU`} />}
        <Row label="Target tick" value={targetTick ? String(targetTick) : "—"} />
      </div>

      {/* Payload — collapsible raw hex (always available for verification) */}
      {payloadHex !== null && (
        <div>
          <button
            onClick={() => setShowPayload((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "var(--space-2)" }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
              {showPayload ? "[HIDE PAYLOAD]" : `[SHOW PAYLOAD · ${payloadByteCount}B]`}
            </span>
          </button>
          {showPayload && (
            <div style={{ marginTop: "var(--space-2)", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", wordBreak: "break-all", lineHeight: 1.6 }}>
              {payloadHex}
            </div>
          )}
        </div>
      )}

      {insufficientBalance && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
          [INSUFFICIENT BALANCE]
        </div>
      )}
      {hasPendingTx && !insufficientBalance && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em" }}>
          [TRANSFER PENDING — WAIT FOR CONFIRMATION]
        </div>
      )}
      {txError && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
          [{txError}]
        </div>
      )}

      <Button onClick={approve} loading={processing} disabled={!wallet || !tickInfo || !!fromError || insufficientBalance || hasPendingTx}>
        Sign and send
      </Button>
      <Button variant="danger" shape="sharp" onClick={onReject}>
        Reject
      </Button>
    </div>
  );
}

function truncate(id: string): string {
  if (!id || id.length <= 20) return id;
  return `${id.slice(0, 10)}...${id.slice(-10)}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em", textAlign: "right", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}
