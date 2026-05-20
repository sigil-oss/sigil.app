import { useState, useEffect, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { Tag } from "@/components/tag";
import { Divider } from "@/components/divider";
import { Modal } from "@/components/modal";
import { IdentityDisplay } from "@/components/identity-display";
import { usePersistedStore, type PendingTx } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useTxHistory } from "@/hooks/use-tx-history";
import { useTickInfo } from "@/hooks/use-tick-info";
import { KNOWN_CONTRACT_ADDRESSES } from "@/lib/contracts";
import { truncateId, formatQu } from "@/lib/format";

type TxFilter = "all" | "received" | "sent";

interface FetchedTx {
  hash?: string;
  source?: string;
  destination?: string;
  amount?: string;
  tickNumber?: number;
  moneyFlew?: boolean;
}

export default function HistoryScreen() {
  const navigate = useNavigate();

  const settings = usePersistedStore((s) => s.settings);
  const hideBalances = settings.hideBalances;
  const pendingTxs = usePersistedStore((s) => s.pendingTxs);
  const wallets = useSessionStore((s) => s.wallets);
  const identity = wallets[settings.activeAccountIndex]?.identity ?? null;

  const { data: txs, isLoading, isError, refetch } = useTxHistory(identity);
  const { data: tickInfo } = useTickInfo();
  const currentTick = tickInfo?.tick ?? 0;

  const [filter, setFilter] = useState<TxFilter>("all");
  const [detail, setDetail] = useState<FetchedTx | PendingTx | null>(null);

  useEffect(() => { setFilter("all"); }, [identity]);

  const isExpired = (p: PendingTx) => currentTick > 0 && currentTick > p.targetTick;

  // Pending txs belonging to this identity
  const myPending = pendingTxs.filter(
    (p) => p.source === identity || p.destination === identity,
  );
  // Filter out pending txs already in fetched results
  const fetchedHashes = new Set((txs ?? []).map((t) => t.hash).filter(Boolean));
  const visiblePending = myPending.filter((p) => !fetchedHashes.has(p.hash));

  const filteredPending = visiblePending.filter((p) => {
    if (filter === "received") return p.destination === identity;
    if (filter === "sent") return p.source === identity;
    return true;
  });

  const filteredTxs = (txs ?? []).filter((tx) => {
    if (filter === "received") return tx.destination === identity;
    if (filter === "sent") return tx.source === identity;
    return true;
  });

  const statusBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <button onClick={() => navigate("/dashboard")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}>
        ← BACK
      </button>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Transactions
      </span>
      <button
        onClick={() => refetch()}
        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}
      >
        ↻
      </button>
    </div>
  );

  const filterTabs = (
    <div style={{ display: "flex", gap: "var(--space-2)", paddingBottom: "var(--space-2)" }}>
      {(["all", "received", "sent"] as TxFilter[]).map((f) => (
        <button
          key={f}
          onClick={() => setFilter(f)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-mono-sm)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "var(--space-1) 0",
            color: filter === f ? "var(--color-text-display)" : "var(--color-text-disabled)",
            borderBottom: filter === f ? "1px solid var(--color-text-display)" : "1px solid transparent",
          }}
        >
          {f}
        </button>
      ))}
    </div>
  );

  const body = () => {
    if (isLoading) return (
      <div style={{ textAlign: "center", padding: "var(--space-12) 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
        [LOADING...]
      </div>
    );
    if (isError) return (
      <div style={{ textAlign: "center", padding: "var(--space-12) 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
        [NETWORK ERROR]
      </div>
    );
    if (filteredPending.length === 0 && filteredTxs.length === 0) return (
      <div style={{ textAlign: "center", padding: "var(--space-12) 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
        {(txs?.length ?? 0) === 0 && visiblePending.length === 0 ? "[NO TRANSACTIONS YET]" : "[NO RESULTS]"}
      </div>
    );

    const rows: ReactElement[] = [];

    // Pending rows (includes expired ones shown as FAILED until cleaned up)
    filteredPending.forEach((p, i) => {
      const isIncoming = p.destination === identity;
      const expired = isExpired(p);
      const isScCall = !!p.contractName;
      if (i > 0 || rows.length > 0) rows.push(<Divider key={`div-p-${i}`} style={{ margin: "var(--space-3) 0" }} />);
      rows.push(
        <button
          key={`pending-${p.hash}`}
          onClick={() => setDetail(p)}
          style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                <Tag variant={expired ? "error" : "warning"}>{expired ? "FAILED" : "PENDING"}</Tag>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                {isScCall ? p.contractName : (isIncoming ? truncateId(p.source) : truncateId(p.destination))}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", marginTop: 2 }}>
                {expired ? `EXPIRED AT TICK ${p.targetTick}` : `TARGET TICK ${p.targetTick}`}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: expired ? "var(--color-text-disabled)" : "var(--color-status-warning)" }}>
                {hideBalances ? "••••••" : `−${formatQu(p.amount)}`}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>QU</div>
            </div>
          </div>
        </button>
      );
    });

    // Fetched rows
    filteredTxs.forEach((tx, i) => {
      const isIncoming = tx.destination === identity;
      const contractName = tx.destination ? KNOWN_CONTRACT_ADDRESSES[tx.destination] : undefined;
      const isScCall = !!contractName;
      const amount = formatQu(tx.amount ?? "0");
      const moneyFlew = tx.moneyFlew ?? true;
      const statusVariant = !moneyFlew ? "error" : isScCall ? "neutral" : (isIncoming ? "success" : "neutral");
      const statusLabel = !moneyFlew ? "FAILED" : isScCall ? "SC CALL" : (isIncoming ? "RECEIVED" : "SENT");
      if (i > 0 || rows.length > 0) rows.push(<Divider key={`div-${i}`} style={{ margin: "var(--space-3) 0" }} />);
      rows.push(
        <button
          key={tx.hash ?? i}
          onClick={() => setDetail(tx)}
          style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                <Tag variant={statusVariant}>{statusLabel}</Tag>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                {isScCall ? contractName : (isIncoming ? truncateId(tx.source ?? "—") : truncateId(tx.destination ?? "—"))}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", marginTop: 2 }}>
                TICK {tx.tickNumber}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-mono-lg)",
                color: moneyFlew
                  ? (isIncoming ? "var(--color-status-success)" : "var(--color-text-primary)")
                  : "var(--color-text-disabled)",
              }}>
                {hideBalances ? "••••••" : `${isIncoming ? "+" : "−"}${amount}`}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>QU</div>
            </div>
          </div>
        </button>
      );
    });

    return rows;
  };

  // Determine if detail is a PendingTx
  const isPending = (d: typeof detail): d is PendingTx => !!d && "broadcastAt" in d;

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {filterTabs}
      {body()}

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {(() => {
              const contractName = isPending(detail)
                ? detail.contractName
                : (detail.destination ? KNOWN_CONTRACT_ADDRESSES[detail.destination] : undefined);
              const isScCall = !!contractName;
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    {isPending(detail) ? (
                      <Tag variant={isExpired(detail) ? "error" : "warning"}>
                        {isExpired(detail) ? "FAILED" : "PENDING"}
                      </Tag>
                    ) : (
                      <Tag variant={!(detail.moneyFlew ?? true) ? "error" : isScCall ? "neutral" : (detail.destination === identity ? "success" : "neutral")}>
                        {!(detail.moneyFlew ?? true) ? "FAILED" : isScCall ? "SC CALL" : (detail.destination === identity ? "RECEIVED" : "SENT")}
                      </Tag>
                    )}
                  </div>
                  {isScCall && (
                    <DetailRow label="Contract">
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em" }}>
                        {contractName}
                      </span>
                    </DetailRow>
                  )}
                </>
              );
            })()}

            <DetailRow label="Amount">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-text-display)" }}>
                {hideBalances ? "••••••" : `${formatQu(detail.amount ?? "0")} QU`}
              </span>
            </DetailRow>

            <DetailRow label="From">
              {detail.source ? (
                <IdentityDisplay identity={detail.source} />
              ) : (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)" }}>—</span>
              )}
            </DetailRow>

            <DetailRow label="To">
              {detail.destination ? (
                <IdentityDisplay identity={detail.destination} />
              ) : (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)" }}>—</span>
              )}
            </DetailRow>

            {isPending(detail) ? (
              <DetailRow label="Target tick">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)" }}>
                  {detail.targetTick}
                </span>
              </DetailRow>
            ) : (
              <DetailRow label="Tick">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)" }}>
                  {detail.tickNumber ?? "—"}
                </span>
              </DetailRow>
            )}

            {detail.hash && (
              <DetailRow label="Hash">
                <IdentityDisplay identity={detail.hash} />
              </DetailRow>
            )}
          </div>
        )}
      </Modal>
    </AppShell>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      {children}
    </div>
  );
}
