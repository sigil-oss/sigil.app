import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Pencil } from "lucide-react";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Sheet } from "@/components/sheet";
import { Tag } from "@/components/tag";
import { Divider } from "@/components/divider";
import { ContactPicker } from "@/components/contact-picker";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useBalance } from "@/hooks/use-balance";
import { useTickInfo } from "@/hooks/use-tick-info";
import { useTxHistory } from "@/hooks/use-tx-history";
import { useLatestStats } from "@/hooks/use-latest-stats";
import { isValidIdentity, newId } from "@/lib/crypto";
import { estimateTargetTick, getLatestTick } from "@/lib/rpc";
import { broadcastTx } from "@/lib/broadcast";
import { buildTransferFromSession } from "@/lib/secure-session";
import { truncateId, formatQu, extractMessage } from "@/lib/format";
import { ReviewRow } from "@/components/review-row";
import { TxSending, TxError } from "@/components/tx-status";
import { TxMemoField } from "@/components/tx-memo-field";

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
  const { data: stats } = useLatestStats();

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

  // Save-contact state shown in done step
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState(false);

  const accountName = vault?.accounts[settings.activeAccountIndex]?.name ?? `Account ${settings.activeAccountIndex + 1}`;
  const identity = wallet?.identity ?? "";
  const hasPendingTx = pendingTxs.some((tx) => tx.source === identity);
  const vaultAccountTargets = (vault?.accounts ?? [])
    .filter((account) => !account.hidden)
    .map((account) => ({
      name: account.name,
      identity: wallets[account.index]?.identity ?? "",
    }))
    .filter((account) => account.identity && account.identity !== identity);
  const canOpenPicker = contacts.length > 0 || vaultAccountTargets.length > 0;

  const { data: recentTxsData } = useTxHistory(identity || null);
  const recentTxs = recentTxsData?.pages[0];

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
    if (!wallet) return;
    setStep("sending");
    try {
      const amount = BigInt(amountStr.trim());
      const currentTick = await getLatestTick();
      const targetTick = estimateTargetTick(currentTick, settings.tickOffset);

      const { encoded, hash } = await buildTransferFromSession({
        accountIndex: settings.activeAccountIndex,
        destination: destUpper,
        amount,
        targetTick,
        currentTick,
      });

      await broadcastTx(encoded);

      addPendingTx({
        hash,
        source: identity,
        destination: destUpper,
        amount: amount.toString(),
        targetTick,
        broadcastAt: Date.now(),
      });

      if (matchedContact) updateContact(matchedContact.id, { lastUsedAt: Date.now() });

      setSavedTargetTick(targetTick);
      setTxHash(hash);
      setStep("done");
    } catch (e) {
      setTxError(extractMessage(e, "Broadcast failed."));
      setStep("error");
    }
  }

  function doSaveContact() {
    if (!saveName.trim()) return;
    addContact({
      id: newId(),
      name: saveName.trim(),
      identity: destUpper,
      note: "",
      addedAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    setSaved(true);
  }

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
              {canOpenPicker && (
                <button
                  onClick={() => setShowPicker(true)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0 }}
                >
                  PICK DESTINATION ↓
                </button>
              )}
            </div>
          </div>

          <AmountInput
            value={amountStr}
            onChange={(qu) => { setAmountStr(qu); setAmountError(""); }}
            onEnter={goReview}
            error={amountError}
            price={stats?.price}
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
      {step === "sending" && <TxSending />}

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

          <TxMemoField hash={txHash} />
          <Button onClick={() => navigate("/dashboard")}>Done</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => navigate("/history")}>
            View history
          </Button>
        </div>
      )}

      {/* ── Error ── */}
      {step === "error" && <TxError message={txError} onRetry={() => setStep("review")} onCancel={() => navigate("/dashboard")} />}

      <ContactPicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(identity) => { setDestination(identity); setDestError(""); setShowPicker(false); }}
        contacts={contacts}
        accounts={vaultAccountTargets}
      />

    </AppShell>
  );
}

function AmountInput({
  value,
  onChange,
  onEnter,
  error,
  price,
}: {
  value: string;
  onChange: (qu: string) => void;
  onEnter?: () => void;
  error?: string;
  price?: number;
}) {
  const [mode, setMode] = useState<"QU" | "USD">("QU");
  const [usdStr, setUsdStr] = useState("");
  const [customPriceBq, setCustomPriceBq] = useState<number | null>(null);
  const [priceOpen, setPriceOpen] = useState(false);
  const [draftBq, setDraftBq] = useState("");

  const marketPriceBq = price !== undefined ? price * 1e9 : undefined;
  const effectivePriceBq = customPriceBq ?? marketPriceBq;
  const effectivePrice = effectivePriceBq !== undefined ? effectivePriceBq / 1e9 : undefined;
  const isOverridden = customPriceBq !== null;

  function formatWholeQu(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "";
    return Math.floor(n).toLocaleString("fullwide", { useGrouping: false, maximumFractionDigits: 0 });
  }

  function openPriceSheet() {
    setDraftBq(effectivePriceBq !== undefined ? effectivePriceBq.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "");
    setPriceOpen(true);
  }

  function applyPrice() {
    const n = parseFloat(draftBq.replace(/,/g, ""));
    if (!isNaN(n) && n > 0) setCustomPriceBq(n);
    setPriceOpen(false);
  }

  function resetPrice() {
    setCustomPriceBq(null);
    setPriceOpen(false);
  }

  function switchMode(next: "QU" | "USD") {
    if (next === mode) return;
    if (next === "USD" && effectivePrice) {
      const n = Number(value);
      setUsdStr(n > 0 ? (n * effectivePrice).toFixed(4) : "");
    }
    if (next === "QU" && effectivePrice && usdStr) {
      const n = parseFloat(usdStr);
      if (!isNaN(n) && n > 0) onChange(formatWholeQu(n / effectivePrice));
    }
    setMode(next);
  }

  function handleQu(raw: string) {
    const qu = raw.replace(/[^0-9]/g, "");
    onChange(qu);
    if (effectivePrice && qu) {
      const n = Number(qu);
      if (n > 0) setUsdStr((n * effectivePrice).toFixed(4));
    }
  }

  function handleUsd(raw: string) {
    const v = raw.replace(/[^0-9.]/g, "");
    setUsdStr(v);
    if (effectivePrice) {
      const n = parseFloat(v);
      onChange(!isNaN(n) && n > 0 ? formatWholeQu(n / effectivePrice) : "");
    }
  }

  const hasPrice = effectivePrice !== undefined;
  const quNum = Number(value);
  const usdEquiv = hasPrice && quNum > 0 ? quNum * effectivePrice! : null;
  const quEquiv = hasPrice && usdStr ? Number(formatWholeQu(parseFloat(usdStr) / effectivePrice!)) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {/* Label row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Amount
        </span>
        {hasPrice && (
          <div style={{ display: "flex", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sharp)", overflow: "hidden" }}>
            {(["QU", "USD"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                style={{
                  padding: "2px var(--space-3)",
                  background: mode === m ? "var(--color-text-display)" : "none",
                  border: "none",
                  borderLeft: m === "USD" ? "1px solid var(--color-border-strong)" : "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-mono-sm)",
                  letterSpacing: "0.05em",
                  color: mode === m ? "var(--color-bg-base)" : "var(--color-text-disabled)",
                  transition: "background 0.1s, color 0.1s",
                }}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main input */}
      <div style={{ position: "relative" }}>
        <input
          autoComplete="off"
          inputMode={mode === "USD" ? "decimal" : "numeric"}
          value={mode === "QU" ? value : usdStr}
          onChange={(e) => mode === "QU" ? handleQu(e.target.value) : handleUsd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          placeholder="0"
          className="sigil-input"
          style={{
            width: "100%",
            background: "var(--color-bg-surface)",
            border: `1px solid ${error ? "var(--color-status-error)" : "var(--color-border-strong)"}`,
            borderRadius: "var(--radius-sharp)",
            padding: "var(--space-3) var(--space-3)",
            paddingRight: `calc(var(--space-3) + ${mode === "QU" ? "1.5rem" : "2rem"})`,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-display)",
            fontWeight: 300,
            color: "var(--color-text-display)",
            textAlign: "right",
            letterSpacing: "-0.01em",
          }}
        />
        <span style={{
          position: "absolute",
          right: "var(--space-3)",
          top: "50%",
          transform: "translateY(-50%)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-mono-lg)",
          color: "var(--color-text-disabled)",
          letterSpacing: "0.05em",
          pointerEvents: "none",
        }}>
          {mode === "QU" ? "QU" : "USD"}
        </span>
      </div>

      {/* Error */}
      {error && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
          {error}
        </span>
      )}

      {/* Equivalent + rate */}
      {hasPrice && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            {mode === "QU" && usdEquiv !== null
              ? `≈ $${usdEquiv.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USD`
              : mode === "USD" && quEquiv !== null && quEquiv > 0
              ? `≈ ${quEquiv.toLocaleString()} QU`
              : null}
          </span>
          {effectivePriceBq !== undefined && (
            <button
              type="button"
              onClick={openPriceSheet}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <Pencil size={10} color={isOverridden ? "var(--color-text-secondary)" : "var(--color-text-disabled)"} strokeWidth={2} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", letterSpacing: "0.05em", color: isOverridden ? "var(--color-text-secondary)" : "var(--color-text-disabled)", opacity: isOverridden ? 1 : 0.6 }}>
                ${effectivePriceBq.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} / bQU{isOverridden ? " *" : ""}
              </span>
            </button>
          )}
        </div>
      )}

      <Sheet
        open={priceOpen}
        onClose={applyPrice}
        title="Price per billion QU"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {isOverridden
              ? <button type="button" onClick={resetPrice} style={PRICE_GHOST_BTN}>RESET TO MARKET</button>
              : <span />}
            <button type="button" onClick={applyPrice} style={PRICE_APPLY_BTN}>APPLY</button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Input
            label="$ / bQU"
            value={draftBq}
            onChange={(e) => setDraftBq(e.target.value.replace(/[^0-9.,]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && applyPrice()}
            placeholder={marketPriceBq?.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) ?? ""}
            inputMode="decimal"
            autoFocus
          />
          {marketPriceBq !== undefined && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
              MARKET PRICE: ${marketPriceBq.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} / bQU
            </span>
          )}
        </div>
      </Sheet>
    </div>
  );
}

const PRICE_GHOST_BTN: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)",
  color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0,
};

const PRICE_APPLY_BTN: React.CSSProperties = {
  background: "var(--color-text-primary)", border: "none",
  borderRadius: "var(--radius-sharp)", cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)",
  color: "var(--color-bg-base)", letterSpacing: "0.05em",
  padding: "var(--space-2) var(--space-4)",
};

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
