import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { buildPayload, type PayloadField } from "@qubic.org/tx";
import type { Identity } from "@qubic.org/types";
import { AppShell } from "@/layouts/app-shell";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Modal } from "@/components/modal";
import { Tag } from "@/components/tag";
import { Divider } from "@/components/divider";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useBalance } from "@/hooks/use-balance";
import { useTickInfo } from "@/hooks/use-tick-info";
import { isValidIdentity } from "@/lib/crypto";
import { getRpcClient, estimateTargetTick } from "@/lib/rpc";
import { QUTIL_ADDRESS, Q_UTIL_SEND_TO_MANY_V1_INPUT_TYPE, qUtilGetSendToManyV1Fee } from "@/lib/contracts";
import { truncateId, formatQu } from "@/lib/format";
import { qk } from "@/lib/query-keys";

const MAX_RECIPIENTS = 25;

interface Recipient {
  id: string;
  identity: string;
  amount: string;
  identityError: string;
  amountError: string;
}

type Step = "input" | "review" | "sending" | "done" | "error";

function emptyRecipient(): Recipient {
  return { id: globalThis.crypto.randomUUID(), identity: "", amount: "", identityError: "", amountError: "" };
}

export default function SendManyScreen() {
  const navigate = useNavigate();

  const contacts = usePersistedStore((s) => s.contacts);
  const updateContact = usePersistedStore((s) => s.updateContact);
  const addPendingTx = usePersistedStore((s) => s.addPendingTx);
  const pendingTxs = usePersistedStore((s) => s.pendingTxs);
  const settings = usePersistedStore((s) => s.settings);
  const wallets = useSessionStore((s) => s.wallets);
  const wallet = wallets[settings.activeAccountIndex] ?? null;
  const { data: tickInfo } = useTickInfo();
  const { data: feeData } = useQuery({
    queryKey: qk.qutilSendManyFee(),
    queryFn: () => qUtilGetSendToManyV1Fee(getRpcClient().live),
    staleTime: 60_000,
  });
  const fee = feeData?.ok ? feeData.value.fee : null;
  const hasPendingTx = pendingTxs.some((tx) => tx.source === (wallet?.identity ?? ""));
  const { data: balanceData } = useBalance(wallet?.identity ?? null);
  const balance = balanceData?.balance ?? null;

  const [step, setStep] = useState<Step>("input");
  const [recipients, setRecipients] = useState<Recipient[]>([emptyRecipient()]);
  const [txHash, setTxHash] = useState("");
  const [txError, setTxError] = useState("");

  // Contact picker state
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  function setField(index: number, field: Partial<Recipient>) {
    setRecipients((prev) => prev.map((r, i) => (i === index ? { ...r, ...field } : r)));
  }

  function addRecipient() {
    if (recipients.length < MAX_RECIPIENTS) setRecipients((prev) => [...prev, emptyRecipient()]);
  }

  function removeRecipient(index: number) {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  }

  function validateAll(): boolean {
    let ok = true;
    const updated = recipients.map((r) => {
      const identityError = isValidIdentity(r.identity.trim().toUpperCase()) ? "" : "INVALID IDENTITY";
      const amount = Number(r.amount.trim());
      const amountError = r.amount.trim() && !isNaN(amount) && amount > 0 ? "" : "INVALID AMOUNT";
      if (identityError || amountError) ok = false;
      return { ...r, identityError, amountError };
    });
    setRecipients(updated);
    return ok;
  }

  function goReview() {
    if (validateAll()) setStep("review");
  }

  const totalAmount = recipients.reduce((sum, r) => {
    const n = Number(r.amount.trim());
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  async function send() {
    if (!wallet || !tickInfo || fee === null) return;
    setStep("sending");
    try {
      const targetTick = estimateTargetTick(tickInfo.tick ?? 0, settings.tickOffset);

      // Build QUtil SendToManyV1 payload: 25 identities then 25 amounts (zero-padded)
      const fields: PayloadField[] = [];
      for (let i = 0; i < MAX_RECIPIENTS; i++) {
        if (i < recipients.length) {
          fields.push({ type: "id", value: recipients[i].identity.trim().toUpperCase() as Identity });
        } else {
          fields.push({ type: "bytes", value: new Uint8Array(32) });
        }
      }
      for (let i = 0; i < MAX_RECIPIENTS; i++) {
        if (i < recipients.length) {
          fields.push({ type: "uint64", value: BigInt(recipients[i].amount.trim()) });
        } else {
          fields.push({ type: "uint64", value: 0n });
        }
      }
      const payload = buildPayload(fields);
      const total = recipients.reduce((s, r) => s + BigInt(r.amount.trim()), 0n) + (fee ?? 0n);

      const { encoded, hash } = await wallet.buildScTransaction({
        destination: QUTIL_ADDRESS,
        inputType: Q_UTIL_SEND_TO_MANY_V1_INPUT_TYPE,
        payload,
        amount: total,
        targetTick,
        currentTick: tickInfo.tick,
      });

      const result = await getRpcClient().live.broadcastTransaction(encoded);
      if (!result.ok) throw result.error;

      // Update lastUsedAt for any matched contacts
      recipients.forEach((r) => {
        const identity = r.identity.trim().toUpperCase();
        const contact = contacts.find((c) => c.identity === identity);
        if (contact) updateContact(contact.id, { lastUsedAt: Date.now() });
      });

      addPendingTx({
        hash,
        source: wallet.identity,
        destination: QUTIL_ADDRESS,
        amount: total.toString(),
        targetTick,
        broadcastAt: Date.now(),
        contractName: "QUtil · Send to Many",
      });

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
        onClick={() => step === "input" || step === "done" || step === "error" ? navigate("/send") : setStep("input")}
        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}
      >
        ← BACK
      </button>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Send to Many
      </span>
      <span style={{ width: 40 }} />
    </div>
  );

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

      {/* ── Input ── */}
      {step === "input" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {recipients.map((r, i) => (
              <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", padding: "var(--space-3)", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sharp)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                    RECIPIENT {i + 1}
                  </span>
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    {contacts.length > 0 && (
                      <button
                        onClick={() => { setPickerIndex(i); setPickerSearch(""); }}
                        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0 }}
                      >
                        FROM CONTACTS ↓
                      </button>
                    )}
                    {recipients.length > 1 && (
                      <button
                        onClick={() => removeRecipient(i)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em", padding: 0 }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <Input
                  value={r.identity}
                  onChange={(e) => setField(i, { identity: e.target.value, identityError: "" })}
                  error={r.identityError}
                  placeholder="60-character identity"
                />
                <Input
                  value={r.amount}
                  onChange={(e) => setField(i, { amount: e.target.value.replace(/[^0-9]/g, ""), amountError: "" })}
                  error={r.amountError}
                  placeholder="Amount (QU)"
                  style={{ textAlign: "right" }}
                />
              </div>
            ))}
          </div>

          {recipients.length < MAX_RECIPIENTS && (
            <button
              onClick={addRecipient}
              style={{ background: "none", border: "1px dashed var(--color-border-strong)", borderRadius: "var(--radius-sharp)", padding: "var(--space-3)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", width: "100%" }}
            >
              + ADD RECIPIENT ({recipients.length}/{MAX_RECIPIENTS})
            </button>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>TOTAL</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                {totalAmount.toLocaleString()} QU
              </span>
            </div>
            {balance !== null && (() => {
              const deducted = recipients.reduce((s, r) => s + (r.amount.trim() ? BigInt(r.amount.trim()) : 0n), 0n) + (fee ?? 0n);
              const remaining = balance - deducted;
              const over = remaining < 0n;
              return (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>AVAILABLE</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", letterSpacing: "0.05em", color: over ? "var(--color-status-error)" : "var(--color-text-secondary)" }}>
                    {formatQu(remaining)} QU
                  </span>
                </div>
              );
            })()}
          </div>

          <Button onClick={goReview} disabled={recipients.length === 0}>Review</Button>
        </>
      )}

      {/* ── Review ── */}
      {step === "review" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>To</span>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Amount</span>
            </div>
            {recipients.map((r) => {
              const id = r.identity.trim().toUpperCase();
              const contact = contacts.find((c) => c.identity === id);
              return (
                <div key={r.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em" }}>
                      {contact ? `${contact.name} · ${truncateId(id)}` : truncateId(id)}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em", flexShrink: 0 }}>
                      {Number(r.amount).toLocaleString()} QU
                    </span>
                  </div>
                </div>
              );
            })}
            <Divider />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Transfers</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em" }}>
                {totalAmount.toLocaleString()} QU
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>QUtil fee</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em" }}>
                {fee !== null ? `${Number(fee).toLocaleString()} QU` : "[LOADING...]"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-display)", letterSpacing: "0.05em" }}>
                {fee !== null ? (totalAmount + Number(fee)).toLocaleString() : "..."} QU
              </span>
            </div>
          </div>

          <Divider />
          {hasPendingTx && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em" }}>
              [TRANSFER PENDING — WAIT FOR CONFIRMATION]
            </div>
          )}
          <Button onClick={send} disabled={fee === null || hasPendingTx}>Sign and send</Button>
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
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            {recipients.length} RECIPIENTS · {totalAmount.toLocaleString()} QU TOTAL
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
          <Button onClick={() => setStep("review")}>Try again</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => navigate("/send")}>
            Cancel
          </Button>
        </div>
      )}

      {/* Contact picker modal */}
      <Modal open={pickerIndex !== null} onClose={() => setPickerIndex(null)}>
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
            {contacts
              .filter((c) => !pickerSearch || c.name.toLowerCase().includes(pickerSearch.toLowerCase()) || c.identity.toLowerCase().includes(pickerSearch.toLowerCase()))
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    if (pickerIndex !== null) {
                      setField(pickerIndex, { identity: c.identity, identityError: "" });
                    }
                    setPickerIndex(null);
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "var(--space-2) var(--space-1)", borderRadius: "var(--radius-sharp)" }}
                >
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>{c.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                    {c.identity.slice(0, 8)}...{c.identity.slice(-8)}
                  </div>
                </button>
              ))}
          </div>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setPickerIndex(null)}>Cancel</Button>
        </div>
      </Modal>

    </AppShell>
  );
}
