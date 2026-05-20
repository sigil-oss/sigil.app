import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { Identity } from "@qubic.org/types";
import { AppShell } from "@/layouts/app-shell";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Tag } from "@/components/tag";
import { Divider } from "@/components/divider";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useAutoLock } from "@/hooks/use-auto-lock";
import { useBalance } from "@/hooks/use-balance";
import { useTickInfo } from "@/hooks/use-tick-info";
import { identityToPublicKey } from "@/lib/crypto";
import { getRpcClient, estimateTargetTick } from "@/lib/rpc";
import {
  QEARN_ADDRESS,
  QEARN_LOCK_INPUT_TYPE,
  buildQearnUnlockInput,
  qearnGetUserLockStatus,
  qearnGetUserLockedInfo,
  qearnGetLockInfoPerEpoch,
} from "@/lib/contracts";

type Tab = "lock" | "unlock";
type Step = "main" | "confirm" | "sending" | "done" | "error";

const QEARN_MIN_LOCK = 10_000_000;

interface Position {
  epoch: number;
  lockedAmount: bigint;
}

const idToPk = (id: string) => identityToPublicKey(id as Identity);
const SC_OPTS = { identityToPublicKey: idToPk };

function fmt(n: bigint | number): string {
  return Number(n).toLocaleString();
}

export default function StakeScreen() {
  const navigate = useNavigate();
  useAutoLock();

  const settings = usePersistedStore((s) => s.settings);
  const addPendingTx = usePersistedStore((s) => s.addPendingTx);
  const wallets = useSessionStore((s) => s.wallets);
  const wallet = wallets[settings.activeAccountIndex] ?? null;
  const identity = wallet?.identity ?? null;

  const { data: tickInfo } = useTickInfo();
  const { data: balanceData } = useBalance(identity);
  const balance = balanceData?.balance ?? null;
  const currentEpoch = tickInfo?.epoch ?? null;

  const [tab, setTab] = useState<Tab>("lock");
  const [step, setStep] = useState<Step>("main");
  const [amountStr, setAmountStr] = useState("");
  const [amountError, setAmountError] = useState("");
  const [unlockTarget, setUnlockTarget] = useState<Position | null>(null);
  const [txHash, setTxHash] = useState("");
  const [txError, setTxError] = useState("");

  // Lock tab: current epoch info
  const { data: epochInfoResult } = useQuery({
    queryKey: ["qearn-epoch-info", currentEpoch],
    queryFn: () => qearnGetLockInfoPerEpoch(getRpcClient().live, { Epoch: currentEpoch! }),
    enabled: !!currentEpoch,
    staleTime: 60_000,
  });
  const epochInfo = epochInfoResult?.ok ? epochInfoResult.value : null;

  // Unlock tab: user's locked positions across last 52 epochs
  const { data: positions, refetch: refetchPositions, isLoading: positionsLoading } = useQuery({
    queryKey: ["qearn-positions", identity, currentEpoch],
    queryFn: async () => {
      if (!identity || !currentEpoch) return [];
      const live = getRpcClient().live;

      const statusResult = await qearnGetUserLockStatus(live, { user: identity }, SC_OPTS);
      if (!statusResult.ok || statusResult.value.status === 0n) return [];

      const epochRange = Array.from({ length: 52 }, (_, i) => currentEpoch - i).filter((e) => e > 0);
      const infos = await Promise.all(
        epochRange.map((epoch) => qearnGetUserLockedInfo(live, { user: identity, epoch }, SC_OPTS)),
      );

      return epochRange
        .map((epoch, i) => {
          const r = infos[i];
          return { epoch, lockedAmount: r?.ok ? r.value.lockedAmount : 0n };
        })
        .filter((p) => p.lockedAmount > 0n);
    },
    enabled: !!identity && !!currentEpoch,
    staleTime: 30_000,
  });

  function goLockConfirm() {
    const trimmed = amountStr.trim();
    if (!trimmed || !/^\d+$/.test(trimmed) || BigInt(trimmed) <= 0n) {
      setAmountError("INVALID AMOUNT");
      return;
    }
    if (BigInt(trimmed) < BigInt(QEARN_MIN_LOCK)) {
      setAmountError(`MINIMUM ${QEARN_MIN_LOCK.toLocaleString()} QU`);
      return;
    }
    if (balance !== null && BigInt(trimmed) > balance) {
      setAmountError("INSUFFICIENT BALANCE");
      return;
    }
    setAmountError("");
    setStep("confirm");
  }

  async function sendLock() {
    if (!wallet || !tickInfo) return;
    setStep("sending");
    try {
      const amount = BigInt(amountStr.trim());
      const targetTick = estimateTargetTick(tickInfo.tick ?? 0, settings.tickOffset);

      const { encoded, hash } = await wallet.buildScTransaction({
        destination: QEARN_ADDRESS,
        inputType: QEARN_LOCK_INPUT_TYPE,
        payload: new Uint8Array(0),
        amount,
        targetTick,
        currentTick: tickInfo.tick,
      });

      const result = await getRpcClient().live.broadcastTransaction(encoded);
      if (!result.ok) throw result.error;

      addPendingTx({
        hash,
        source: wallet.identity,
        destination: QEARN_ADDRESS,
        amount: amount.toString(),
        targetTick,
        broadcastAt: Date.now(),
        contractName: "Qearn · Lock",
      });

      setTxHash(hash);
      setStep("done");
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Broadcast failed.");
      setStep("error");
    }
  }

  async function sendUnlock() {
    if (!wallet || !tickInfo || !unlockTarget) return;
    setStep("sending");
    try {
      const { inputType, payload } = buildQearnUnlockInput({
        amount: unlockTarget.lockedAmount,
        lockedEpoch: unlockTarget.epoch,
      });
      const targetTick = estimateTargetTick(tickInfo.tick ?? 0, settings.tickOffset);

      const { encoded, hash } = await wallet.buildScTransaction({
        destination: QEARN_ADDRESS,
        inputType,
        payload,
        amount: 0n,
        targetTick,
        currentTick: tickInfo.tick,
      });

      const result = await getRpcClient().live.broadcastTransaction(encoded);
      if (!result.ok) throw result.error;

      addPendingTx({
        hash,
        source: wallet.identity,
        destination: QEARN_ADDRESS,
        amount: "0",
        targetTick,
        broadcastAt: Date.now(),
        contractName: "Qearn · Unlock",
      });

      setTxHash(hash);
      setStep("done");
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Broadcast failed.");
      setStep("error");
    }
  }

  function handleBack() {
    if (step === "main" || step === "done" || step === "error") {
      navigate("/dashboard");
    } else {
      setStep("main");
      setUnlockTarget(null);
    }
  }

  const statusBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <button
        onClick={handleBack}
        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}
      >
        ← BACK
      </button>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Qearn
      </span>
      <span style={{ width: 40 }} />
    </div>
  );

  const entered = amountStr.trim() && /^\d+$/.test(amountStr.trim()) ? BigInt(amountStr.trim()) : 0n;
  const remaining = balance !== null ? balance - entered : null;
  const balanceOver = remaining !== null && remaining < 0n;

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

      {/* ── Tab bar (only on main step) ── */}
      {step === "main" && (
        <div style={{ display: "flex", gap: "var(--space-4)", borderBottom: "1px solid var(--color-border-strong)", paddingBottom: "var(--space-2)" }}>
          {(["lock", "unlock"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-mono-sm)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "var(--space-1) 0",
                color: tab === t ? "var(--color-text-display)" : "var(--color-text-disabled)",
                borderBottom: tab === t ? "1px solid var(--color-text-display)" : "1px solid transparent",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* ── Lock — Input ── */}
      {step === "main" && tab === "lock" && (
        <>
          {!currentEpoch ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
              [LOADING...]
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>EPOCH</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>{currentEpoch}</span>
                </div>
                {epochInfo && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>TOTAL LOCKED</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>{fmt(epochInfo.currentLockedAmount)} QU</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>REWARD POOL</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-success)", letterSpacing: "0.05em" }}>{fmt(epochInfo.currentBonusAmount)} QU</span>
                    </div>
                  </>
                )}
              </div>

              <Divider />

              <Input
                label="Amount (QU)"
                value={amountStr}
                onChange={(e) => { setAmountStr(e.target.value.replace(/[^0-9]/g, "")); setAmountError(""); }}
                onKeyDown={(e) => e.key === "Enter" && goLockConfirm()}
                error={amountError}
                placeholder="0"
                style={{ textAlign: "right", fontSize: "var(--text-display)", fontWeight: 300, fontFamily: "var(--font-sans)" }}
              />

              {remaining !== null && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>AVAILABLE</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", letterSpacing: "0.05em", color: balanceOver ? "var(--color-status-error)" : "var(--color-text-secondary)" }}>
                    {Number(remaining).toLocaleString()} QU
                  </span>
                </div>
              )}

              <Button onClick={goLockConfirm} disabled={!amountStr.trim()}>Continue</Button>
            </>
          )}
        </>
      )}

      {/* ── Unlock — Positions list ── */}
      {step === "main" && tab === "unlock" && (
        <>
          {!currentEpoch || positionsLoading ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
              [LOADING...]
            </div>
          ) : !positions || positions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "var(--space-12) 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
              [NO ACTIVE POSITIONS]
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {positions.map((pos) => {
                const unlockEpoch = pos.epoch + 52;
                const isEarly = currentEpoch < unlockEpoch;
                return (
                  <div key={pos.epoch} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", padding: "var(--space-3)", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sharp)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                        EPOCH {pos.epoch}
                      </span>
                      {isEarly && <Tag variant="warning">EARLY</Tag>}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-text-display)" }}>
                      {fmt(pos.lockedAmount)} QU
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                      {isEarly ? `MATURES EPOCH ${unlockEpoch}` : "READY TO UNLOCK"}
                    </div>
                    <Button
                      variant={isEarly ? "danger" : "primary"}
                      shape="sharp"
                      size="md"
                      style={{ width: "auto" }}
                      onClick={() => { setUnlockTarget(pos); setStep("confirm"); }}
                    >
                      {isEarly ? "Early Unlock" : "Unlock"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Lock Confirm ── */}
      {step === "confirm" && tab === "lock" && (
        <>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "var(--text-display)", color: "var(--color-text-display)", letterSpacing: "-0.02em" }}>
              {Number(amountStr).toLocaleString()}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-text-secondary)" }}>QU</div>
          </div>
          <Divider />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <ReviewRow label="Contract" value="Qearn" />
            <ReviewRow label="Action" value="Lock QU" />
            <ReviewRow label="Lock epoch" value={String(currentEpoch)} />
            <ReviewRow label="Unlocks at epoch" value={String((currentEpoch ?? 0) + 52)} />
          </div>
          <Divider />
          <Button onClick={sendLock}>Sign and send</Button>
          <Button variant="secondary" shape="sharp" onClick={() => setStep("main")}>Cancel</Button>
        </>
      )}

      {/* ── Unlock Confirm ── */}
      {step === "confirm" && tab === "unlock" && unlockTarget && (
        <>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "var(--text-display)", color: "var(--color-text-display)", letterSpacing: "-0.02em" }}>
              {fmt(unlockTarget.lockedAmount)}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-text-secondary)" }}>QU</div>
          </div>
          <Divider />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <ReviewRow label="Contract" value="Qearn" />
            <ReviewRow label="Action" value="Unlock QU" />
            <ReviewRow label="Lock epoch" value={String(unlockTarget.epoch)} />
            {currentEpoch !== null && currentEpoch < unlockTarget.epoch + 52 && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em", lineHeight: 1.5 }}>
                [WARNING] EARLY UNLOCK — REWARDS MAY BE REDUCED OR FORFEITED.
              </div>
            )}
          </div>
          <Divider />
          <Button onClick={sendUnlock}>Sign and send</Button>
          <Button variant="secondary" shape="sharp" onClick={() => { setStep("main"); setUnlockTarget(null); }}>Cancel</Button>
        </>
      )}

      {/* ── Sending ── */}
      {step === "sending" && (
        <div style={{ textAlign: "center", padding: "var(--space-12) 0" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
            [BROADCASTING...]
          </span>
        </div>
      )}

      {/* ── Done ── */}
      {step === "done" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <div style={{ textAlign: "center" }}>
            <Tag variant="success">{tab === "lock" ? "LOCKED" : "UNLOCKED"}</Tag>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
              Transaction hash
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em", wordBreak: "break-all" }}>
              {txHash}
            </div>
          </div>
          <Button onClick={() => navigate("/dashboard")}>Done</Button>
          <Button
            variant="ghost"
            shape="sharp"
            size="md"
            style={{ width: "auto", margin: "0 auto" }}
            onClick={() => { setStep("main"); refetchPositions(); }}
          >
            Back to Qearn
          </Button>
        </div>
      )}

      {/* ── Error ── */}
      {step === "error" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <div style={{ textAlign: "center" }}>
            <Tag variant="error">BROADCAST FAILED</Tag>
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-secondary)" }}>
            {txError || "The transaction could not be broadcast."}
          </div>
          <Button onClick={() => setStep("confirm")}>Try again</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => navigate("/dashboard")}>
            Cancel
          </Button>
        </div>
      )}

    </AppShell>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}
