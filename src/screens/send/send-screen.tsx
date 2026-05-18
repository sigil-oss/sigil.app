import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Tag } from "@/components/tag";
import { Divider } from "@/components/divider";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useAutoLock } from "@/hooks/use-auto-lock";
import { useTickInfo } from "@/hooks/use-tick-info";
import { isIdentity } from "@/lib/crypto";
import { getRpcClient, estimateTargetTick } from "@/lib/rpc";

type Step = "input" | "review" | "sending" | "done" | "error";

function truncate(id: string): string {
  if (id.length <= 20) return id;
  return `${id.slice(0, 10)}...${id.slice(-10)}`;
}

export default function SendScreen() {
  const navigate = useNavigate();
  useAutoLock();

  const settings = usePersistedStore((s) => s.settings);
  const vault = usePersistedStore((s) => s.vaults.find((v) => v.id === s.settings.activeVaultId));
  const contacts = usePersistedStore((s) => s.contacts);
  const wallets = useSessionStore((s) => s.wallets);

  const wallet = wallets[settings.activeAccountIndex] ?? null;
  const { data: tickInfo } = useTickInfo();

  const [step, setStep] = useState<Step>("input");
  const [destination, setDestination] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [destError, setDestError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [txError, setTxError] = useState("");

  const accountName = vault?.accounts[settings.activeAccountIndex]?.name ?? "Account";
  const identity = wallet?.identity ?? "";

  const matchedContact = contacts.find(
    (c) => c.identity === destination.trim().toUpperCase(),
  );

  function validateInputs(): boolean {
    let ok = true;
    const dest = destination.trim().toUpperCase();
    if (!isIdentity(dest)) {
      setDestError("INVALID IDENTITY");
      ok = false;
    } else {
      setDestError("");
    }
    const amount = amountStr.trim();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setAmountError("INVALID AMOUNT");
      ok = false;
    } else {
      setAmountError("");
    }
    return ok;
  }

  function goReview() {
    if (validateInputs()) setStep("review");
  }

  async function send() {
    if (!wallet || !tickInfo) return;
    setStep("sending");
    try {
      const dest = destination.trim().toUpperCase() as Parameters<typeof wallet.buildTransfer>[0]["destination"];
      const amount = BigInt(Math.round(Number(amountStr.trim())));
      const targetTick = estimateTargetTick(tickInfo.tick ?? 0, 10);

      const { encoded, hash } = await wallet.buildTransfer({
        destination: dest,
        amount,
        targetTick,
        currentTick: tickInfo.tick,
      });

      const result = await getRpcClient().live.broadcastTransaction(encoded);
      if (!result.ok) throw result.error;

      setTxHash(hash);
      setStep("done");
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Broadcast failed.");
      setStep("error");
    }
  }

  const statusBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <button
        onClick={() => step === "input" || step === "done" || step === "error" ? navigate("/dashboard") : setStep("input")}
        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}
      >
        ← BACK
      </button>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Send QU
      </span>
      <span style={{ width: 40 }} />
    </div>
  );

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

      {/* ── Input ── */}
      {step === "input" && (
        <>
          <Input
            label="To"
            value={destination}
            onChange={(e) => { setDestination(e.target.value); setDestError(""); }}
            error={destError}
            placeholder="60-character identity"
          />
          {matchedContact && !destError && (
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "calc(-1 * var(--space-4))" }}>
              {matchedContact.name}
            </div>
          )}

          <Input
            label="Amount (QU)"
            value={amountStr}
            onChange={(e) => { setAmountStr(e.target.value.replace(/[^0-9]/g, "")); setAmountError(""); }}
            onKeyDown={(e) => e.key === "Enter" && goReview()}
            error={amountError}
            placeholder="0"
            style={{ textAlign: "right", fontSize: "var(--text-display)", fontWeight: 300, fontFamily: "var(--font-sans)" }}
          />

          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            FROM: {accountName} · {truncate(identity)}
          </div>

          <Button onClick={goReview}>Review</Button>
        </>
      )}

      {/* ── Review ── */}
      {step === "review" && (
        <>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "var(--text-display)", color: "var(--color-text-display)", letterSpacing: "-0.02em" }}>
              {Number(amountStr).toLocaleString()}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-text-secondary)" }}>QU</div>
          </div>

          <Divider />

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <ReviewRow label="From" value={`${accountName} · ${truncate(identity)}`} />
            <ReviewRow label="To" value={matchedContact ? `${matchedContact.name} · ${truncate(destination.trim().toUpperCase())}` : truncate(destination.trim().toUpperCase())} />
            <ReviewRow label="Target tick" value={tickInfo ? String(estimateTargetTick(tickInfo.tick ?? 0, 10)) : "—"} />
            <ReviewRow label="Fee" value="None" />
          </div>

          <Divider />

          <Button onClick={send}>Sign and send</Button>
          <Button variant="secondary" shape="sharp" onClick={() => setStep("input")}>Edit</Button>
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
            <Tag variant="success">SENT</Tag>
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
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => navigate("/history")}>
            View history
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
            {txError || "The transaction could not be broadcast. Check your connection and try again."}
          </div>
          <Button onClick={() => setStep("review")}>Try again</Button>
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
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em", textAlign: "right", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}
