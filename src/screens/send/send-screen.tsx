import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Tag } from "@/components/tag";
import { Divider } from "@/components/divider";
import { Modal } from "@/components/modal";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useBalance } from "@/hooks/use-balance";
import { useTickInfo } from "@/hooks/use-tick-info";
import { useTxHistory } from "@/hooks/use-tx-history";
import { isValidIdentity } from "@/lib/crypto";
import { getRpcClient, estimateTargetTick } from "@/lib/rpc";
import { truncateId, formatQu } from "@/lib/format";
import { ReviewRow } from "@/components/review-row";

type Step = "input" | "review" | "sending" | "done" | "error";

export default function SendScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const settings = usePersistedStore((s) => s.settings);
  const vault = usePersistedStore((s) => s.vaults.find((v) => v.id === s.settings.activeVaultId));
  const contacts = usePersistedStore((s) => s.contacts);
  const addContact = usePersistedStore((s) => s.addContact);
  const updateContact = usePersistedStore((s) => s.updateContact);
  const addPendingTx = usePersistedStore((s) => s.addPendingTx);
  const pendingTxs = usePersistedStore((s) => s.pendingTxs);
  const wallets = useSessionStore((s) => s.wallets);

  const wallet = wallets[settings.activeAccountIndex] ?? null;
  const { data: tickInfo } = useTickInfo();
  const { data: balanceData } = useBalance(wallet?.identity ?? null);
  const balance = balanceData?.balance ?? null;

  const [step, setStep] = useState<Step>("input");
  const [destination, setDestination] = useState(() => searchParams.get("to") ?? "");
  const [amountStr, setAmountStr] = useState("");
  const [destError, setDestError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [txError, setTxError] = useState("");
  const [savedTargetTick, setSavedTargetTick] = useState(0);
  const [watchConfirmation, setWatchConfirmation] = useState(
    !!(settings.notificationsEnabled && settings.notifyOnConfirmed)
  );
  const [watchResult, setWatchResult] = useState<"pending" | "confirmed" | "failed">("pending");

  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // Save-contact state shown in done step
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState(false);

  const accountName = vault?.accounts[settings.activeAccountIndex]?.name ?? "Account";
  const identity = wallet?.identity ?? "";
  const hasPendingTx = pendingTxs.some((tx) => tx.source === identity);

  const { data: recentTxs } = useTxHistory(identity || null);

  const destUpper = destination.trim().toUpperCase();
  const matchedContact = contacts.find((c) => c.identity === destUpper);
  const destIsKnownContact = !!matchedContact;

  // Poll for confirmation when user opts in
  useEffect(() => {
    if (!watchConfirmation || !txHash || watchResult !== "pending") return;
    const found = recentTxs?.find((t) => t.hash === txHash);
    if (found) {
      setWatchResult(found.moneyFlew === false ? "failed" : "confirmed");
      return;
    }
    if (tickInfo?.tick && savedTargetTick && tickInfo.tick > savedTargetTick + 30) {
      setWatchResult("failed");
    }
  }, [watchConfirmation, txHash, recentTxs, tickInfo, savedTargetTick, watchResult]);

  function validateInputs(): boolean {
    let ok = true;
    if (!isValidIdentity(destUpper)) {
      setDestError("INVALID IDENTITY");
      ok = false;
    } else {
      setDestError("");
    }
    const amount = amountStr.trim();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setAmountError("INVALID AMOUNT");
      ok = false;
    } else if (balance !== null && BigInt(amount) > balance) {
      setAmountError("INSUFFICIENT BALANCE");
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
      const dest = destUpper as Parameters<typeof wallet.buildTransfer>[0]["destination"];
      const amount = BigInt(amountStr.trim());
      const targetTick = estimateTargetTick(tickInfo.tick ?? 0, settings.tickOffset);

      const { encoded, hash } = await wallet.buildTransfer({
        destination: dest,
        amount,
        targetTick,
        currentTick: tickInfo.tick,
      });

      const result = await getRpcClient().live.broadcastTransaction(encoded);
      if (!result.ok) throw result.error;

      addPendingTx({
        hash,
        source: identity,
        destination: dest,
        amount: amount.toString(),
        targetTick,
        broadcastAt: Date.now(),
      });

      if (matchedContact) updateContact(matchedContact.id, { lastUsedAt: Date.now() });

      setSavedTargetTick(targetTick);
      setTxHash(hash);
      setStep("done");
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Broadcast failed.");
      setStep("error");
    }
  }

  function doSaveContact() {
    if (!saveName.trim()) return;
    addContact({
      id: globalThis.crypto.randomUUID(),
      name: saveName.trim(),
      identity: destUpper,
      note: "",
      addedAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    setSaved(true);
  }

  const pickerFiltered = contacts.filter(
    (c) => !pickerSearch || c.name.toLowerCase().includes(pickerSearch.toLowerCase()) || c.identity.toLowerCase().includes(pickerSearch.toLowerCase()),
  );

  const statusBar = (
    <ScreenHeader
      title="Send QU"
      onBack={() => step === "input" || step === "done" || step === "error" ? navigate("/dashboard") : setStep("input")}
    />
  );

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

      {/* ── Input ── */}
      {step === "input" && (
        <>
          <div>
            <Input
              label="To"
              value={destination}
              onChange={(e) => { setDestination(e.target.value); setDestError(""); }}
              error={destError}
              placeholder="60-character identity"
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-1)" }}>
              {matchedContact && !destError ? (
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
                  {matchedContact.name}
                </span>
              ) : <span />}
              {contacts.length > 0 && (
                <button
                  onClick={() => { setPickerSearch(""); setShowPicker(true); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0 }}
                >
                  FROM CONTACTS ↓
                </button>
              )}
            </div>
          </div>

          <Input
            label="Amount (QU)"
            value={amountStr}
            onChange={(e) => { setAmountStr(e.target.value.replace(/[^0-9]/g, "")); setAmountError(""); }}
            onKeyDown={(e) => e.key === "Enter" && goReview()}
            error={amountError}
            placeholder="0"
            style={{ textAlign: "right", fontSize: "var(--text-display)", fontWeight: 300, fontFamily: "var(--font-sans)" }}
          />

          <BalanceBar balance={balance} amountStr={amountStr} />

          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            FROM: {accountName} · {truncateId(identity)}
          </div>

          <Button onClick={goReview}>Review</Button>

          <div style={{ display: "flex", justifyContent: "center", gap: "var(--space-6)", paddingTop: "var(--space-2)" }}>
            <button onClick={() => navigate("/send-many")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0 }}>
              SEND TO MANY →
            </button>
            <button onClick={() => navigate("/burn")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0 }}>
              BURN QU →
            </button>
          </div>
        </>
      )}

      {/* ── Review ── */}
      {step === "review" && (
        <>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "var(--text-display)", color: "var(--color-text-display)", letterSpacing: "-0.02em" }}>
              {formatQu(amountStr)}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-text-secondary)" }}>QU</div>
          </div>

          <Divider />

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <ReviewRow label="From" value={`${accountName} · ${truncateId(identity)}`} />
            <ReviewRow label="To" value={matchedContact ? `${matchedContact.name} · ${truncateId(destUpper)}` : truncateId(destUpper)} />
            <ReviewRow label="Target tick" value={tickInfo ? String(estimateTargetTick(tickInfo.tick ?? 0, settings.tickOffset)) : "—"} />
            <ReviewRow label="Fee" value="None" />
          </div>

          <Divider />

          {hasPendingTx && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em" }}>
              [TRANSFER PENDING — WAIT FOR CONFIRMATION]
            </div>
          )}

          <Button onClick={send} disabled={!wallet || !tickInfo || hasPendingTx}>Sign and send</Button>
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
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
              TARGET TICK {savedTargetTick} · [PENDING]
            </div>
          </div>

          {/* Save-contact prompt */}
          {!destIsKnownContact && !saved && (
            <div style={{ borderTop: "1px solid var(--color-border-strong)", paddingTop: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                SAVE {truncateId(destUpper)} TO CONTACTS?
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <input
                  autoComplete="off"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doSaveContact()}
                  placeholder="Contact name"
                  className="sigil-input"
                  style={{
                    flex: 1,
                    background: "var(--color-bg-subtle)",
                    borderRadius: "var(--radius-sharp)",
                    padding: "var(--space-2) var(--space-3)",
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-body)",
                    color: "var(--color-text-display)",
                  }}
                />
                <Button
                  variant="secondary"
                  shape="sharp"
                  size="sm"
                  style={{ width: "auto" }}
                  onClick={doSaveContact}
                  disabled={!saveName.trim()}
                >
                  Save
                </Button>
              </div>
            </div>
          )}
          {saved && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-success)", letterSpacing: "0.05em" }}>
              [CONTACT SAVED]
            </div>
          )}

          {/* Watch confirmation opt-in */}
          <div
            role="checkbox"
            aria-checked={watchConfirmation}
            tabIndex={0}
            onClick={() => { setWatchConfirmation((v) => !v); setWatchResult("pending"); }}
            onKeyDown={(e) => e.key === " " && (setWatchConfirmation((v) => !v), setWatchResult("pending"))}
            style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer", userSelect: "none" }}
          >
            <div style={{
              width: 14, height: 14, flexShrink: 0,
              border: `1px solid ${watchConfirmation ? "var(--color-text-display)" : "var(--color-border-strong)"}`,
              borderRadius: 2,
              background: watchConfirmation ? "var(--color-text-display)" : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {watchConfirmation && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-bg-base)", lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
              WATCH FOR CONFIRMATION
            </span>
          </div>

          {watchConfirmation && (
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-mono-sm)",
              letterSpacing: "0.05em",
              color: watchResult === "confirmed" ? "var(--color-status-success)"
                : watchResult === "failed" ? "var(--color-status-error)"
                : "var(--color-text-disabled)",
            }}>
              {watchResult === "pending" && "[WAITING FOR CONFIRMATION...]"}
              {watchResult === "confirmed" && "[CONFIRMED — MONEY FLEW ✓]"}
              {watchResult === "failed" && "[FAILED — MONEY DID NOT FLY]"}
            </div>
          )}

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

      <Modal open={showPicker} onClose={() => setShowPicker(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <input
            autoFocus
            autoComplete="off"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            placeholder="Search contacts..."
            className="sigil-input"
            style={{ background: "var(--color-bg-subtle)", borderRadius: "var(--radius-sharp)", padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-display)", width: "100%", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", maxHeight: 280, overflowY: "auto" }}>
            {pickerFiltered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setDestination(c.identity); setDestError(""); setShowPicker(false); }}
                  style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "var(--space-2) var(--space-1)", borderRadius: "var(--radius-sharp)" }}
                >
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>{c.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                    {c.identity.slice(0, 8)}...{c.identity.slice(-8)}
                  </div>
                </button>
              ))}
            {pickerFiltered.length === 0 && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: "var(--space-4)", textAlign: "center" }}>
                [NO RESULTS]
              </div>
            )}
          </div>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setShowPicker(false)}>Cancel</Button>
        </div>
      </Modal>

    </AppShell>
  );
}

function BalanceBar({ balance, amountStr }: { balance: bigint | null; amountStr: string }) {
  if (balance === null) return null;
  const n = amountStr.trim();
  const entered = n ? BigInt(n) : 0n;
  const remaining = balance - entered;
  const over = remaining < 0n;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
        AVAILABLE
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", letterSpacing: "0.05em", color: over ? "var(--color-status-error)" : "var(--color-text-secondary)" }}>
        {formatQu(remaining)} QU
      </span>
    </div>
  );
}
