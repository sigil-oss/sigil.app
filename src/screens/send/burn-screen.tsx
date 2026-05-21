import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Tag } from "@/components/tag";
import { Divider } from "@/components/divider";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useBalance } from "@/hooks/use-balance";
import { useTickInfo } from "@/hooks/use-tick-info";
import { getRpcClient, estimateTargetTick } from "@/lib/rpc";
import { buildQUtilBurnQubicInput, QUTIL_ADDRESS } from "@/lib/contracts";
import { formatQu } from "@/lib/format";

type Step = "input" | "confirm" | "sending" | "done" | "error";

export default function BurnScreen() {
  const navigate = useNavigate();

  const settings = usePersistedStore((s) => s.settings);
  const addPendingTx = usePersistedStore((s) => s.addPendingTx);
  const pendingTxs = usePersistedStore((s) => s.pendingTxs);
  const wallets = useSessionStore((s) => s.wallets);
  const wallet = wallets[settings.activeAccountIndex] ?? null;
  const hasPendingTx = pendingTxs.some((tx) => tx.source === (wallet?.identity ?? ""));
  const { data: tickInfo } = useTickInfo();
  const { data: balanceData } = useBalance(wallet?.identity ?? null);
  const balance = balanceData?.balance ?? null;

  const [step, setStep] = useState<Step>("input");
  const [amountStr, setAmountStr] = useState("");
  const [amountError, setAmountError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [txError, setTxError] = useState("");

  function goConfirm() {
    const trimmed = amountStr.trim();
    if (!trimmed || !/^\d+$/.test(trimmed) || BigInt(trimmed) <= 0n) {
      setAmountError("INVALID AMOUNT");
      return;
    }
    if (balance !== null && BigInt(trimmed) > balance) {
      setAmountError("INSUFFICIENT BALANCE");
      return;
    }
    setAmountError("");
    setStep("confirm");
  }

  async function send() {
    if (!wallet || !tickInfo) return;
    setStep("sending");
    try {
      const amount = BigInt(amountStr.trim());
      const targetTick = estimateTargetTick(tickInfo.tick ?? 0, settings.tickOffset);

      const { inputType, payload } = buildQUtilBurnQubicInput({ amount });
      const { encoded, hash } = await wallet.buildScTransaction({
        destination: QUTIL_ADDRESS,
        inputType,
        payload,
        amount,
        targetTick,
        currentTick: tickInfo.tick,
      });

      const result = await getRpcClient().live.broadcastTransaction(encoded);
      if (!result.ok) throw result.error;

      addPendingTx({
        hash,
        source: wallet.identity,
        destination: QUTIL_ADDRESS,
        amount: amount.toString(),
        targetTick,
        broadcastAt: Date.now(),
        contractName: "QUtil · Burn",
      });

      setTxHash(hash);
      setStep("done");
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Broadcast failed.");
      setStep("error");
    }
  }

  const statusBar = (
    <ScreenHeader
      title="Burn QU"
      onBack={() => step === "input" || step === "done" || step === "error" ? navigate("/send") : setStep("input")}
    />
  );

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

      {/* ── Input ── */}
      {step === "input" && (
        <>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em", lineHeight: 1.6 }}>
            [WARNING] BURNED QU IS PERMANENTLY DESTROYED. THIS CANNOT BE UNDONE.
          </div>
          <Input
            label="Amount (QU)"
            value={amountStr}
            onChange={(e) => { setAmountStr(e.target.value.replace(/[^0-9]/g, "")); setAmountError(""); }}
            onKeyDown={(e) => e.key === "Enter" && goConfirm()}
            error={amountError}
            placeholder="0"
            style={{ textAlign: "right", fontSize: "var(--text-display)", fontWeight: 300, fontFamily: "var(--font-sans)" }}
          />
          <Button variant="danger" shape="sharp" onClick={goConfirm} disabled={!amountStr.trim() || !wallet || !tickInfo}>
            Continue
          </Button>
        </>
      )}

      {/* ── Confirm ── */}
      {step === "confirm" && (
        <>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "var(--text-display)", color: "var(--color-status-error)", letterSpacing: "-0.02em" }}>
              {formatQu(amountStr)}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-status-error)" }}>QU</div>
          </div>

          <Divider />

          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", lineHeight: 1.6, textAlign: "center" }}>
            THIS QU WILL BE PERMANENTLY DESTROYED.
            <br />
            THERE IS NO UNDO.
          </div>

          <Divider />

          <Button variant="danger" shape="sharp" onClick={send} disabled={!wallet || !tickInfo || hasPendingTx}>Burn {Number(amountStr).toLocaleString()} QU</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setStep("input")}>Cancel</Button>
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
            <Tag variant="success">BURNED</Tag>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
              Transaction hash
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em", wordBreak: "break-all" }}>
              {txHash}
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            {Number(amountStr).toLocaleString()} QU DESTROYED
          </div>
          <Button onClick={() => navigate("/dashboard")}>Done</Button>
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
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => navigate("/send")}>
            Cancel
          </Button>
        </div>
      )}

    </AppShell>
  );
}
