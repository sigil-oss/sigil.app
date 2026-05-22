import { useState, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { Tag } from "@/components/tag";
import { Divider } from "@/components/divider";
import { Modal } from "@/components/modal";
import { Sheet } from "@/components/sheet";
import { Input } from "@/components/input";
import { IdentityDisplay } from "@/components/identity-display";
import { usePersistedStore, type PendingTx } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { Download, SlidersHorizontal, RotateCw } from "lucide-react";
import {
  useTxHistory,
  type TxHistoryItem,
  type TxQueryFilters,
  DEFAULT_QUERY_FILTERS,
} from "@/hooks/use-tx-history";
import { useTickInfo } from "@/hooks/use-tick-info";
import { KNOWN_CONTRACT_ADDRESSES, CONTRACT_PROCEDURE_NAMES, CONTRACT_NAMES } from "@/lib/contracts";
import { truncateId, formatQu, formatQuCompact, formatDate } from "@/lib/format";

// ── Filter types ──────────────────────────────────────────────────────────────

type TxFilters = TxQueryFilters;

const DEFAULT_FILTERS: TxFilters = { ...DEFAULT_QUERY_FILTERS };

// Draft state for text inputs — committed on APPLY
type DraftInputs = {
  minAmount: string;
  maxAmount: string;
  dateFrom: string;
  dateTo: string;
  tickFrom: string;
  tickTo: string;
};

function toDraft(f: TxFilters): DraftInputs {
  return { minAmount: f.minAmount, maxAmount: f.maxAmount, dateFrom: f.dateFrom, dateTo: f.dateTo, tickFrom: f.tickFrom, tickTo: f.tickTo };
}

function sanitize(s: string): string {
  const n = s.trim();
  return n && /^\d+$/.test(n) && Number(n) > 0 ? n : "";
}

function isDefault(f: TxFilters): boolean {
  return (
    f.direction === "all" && f.type === "all" &&
    !f.minAmount && !f.maxAmount && !f.dateFrom && !f.dateTo && !f.tickFrom && !f.tickTo
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const navigate = useNavigate();
  const settings = usePersistedStore((s) => s.settings);
  const pendingTxs = usePersistedStore((s) => s.pendingTxs);
  const wallets = useSessionStore((s) => s.wallets);
  const identity = wallets[settings.activeAccountIndex]?.identity ?? null;

  const txMemos = usePersistedStore((s) => s.txMemos);

  const [filters, setFilters] = useState<TxFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<DraftInputs>(toDraft(DEFAULT_FILTERS));
  const [detail, setDetail] = useState<TxHistoryItem | PendingTx | null>(null);

  function exportMemos() {
    const entries = Object.entries(txMemos).filter(([, v]) => v.trim());
    if (!entries.length) return;
    const blob = new Blob([JSON.stringify(Object.fromEntries(entries), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sigil-memos-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasMemos = Object.values(txMemos).some((v) => v.trim());
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTxHistory(identity, filters);
  const { data: tickInfo } = useTickInfo();
  const currentTick = tickInfo?.tick ?? 0;

  useEffect(() => { setFilters(DEFAULT_FILTERS); setDraft(toDraft(DEFAULT_FILTERS)); }, [identity]);

  // Sync draft when sheet opens so edits start from current values
  useEffect(() => { if (filterOpen) setDraft(toDraft(filters)); }, [filterOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage(); },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function applyAndClose() {
    setFilters((f) => ({
      ...f,
      minAmount: sanitize(draft.minAmount),
      maxAmount: sanitize(draft.maxAmount),
      dateFrom: draft.dateFrom,
      dateTo: draft.dateTo,
      tickFrom: sanitize(draft.tickFrom),
      tickTo: sanitize(draft.tickTo),
    }));
    setFilterOpen(false);
  }

  const allTxs = data?.pages.flat() ?? [];
  const fetchedHashes = new Set(allTxs.map((t) => t.hash));
  const myPending = pendingTxs.filter((p) => p.source === identity || p.destination === identity);
  const visiblePending = myPending.filter((p) => !fetchedHashes.has(p.hash));

  const filteredPending = visiblePending.filter((p) => {
    if (filters.direction === "in") return p.destination === identity;
    if (filters.direction === "out") return p.source === identity;
    return true;
  });

  const filteredTxs = allTxs;

  const hasActive = !isDefault(filters);
  const isExpired = (p: PendingTx) => currentTick > 0 && currentTick > p.targetTick;

  // ── Active filter chips ───────────────────────────────────────────────────
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.direction !== "all") chips.push({ label: filters.direction.toUpperCase(), clear: () => setFilters((f) => ({ ...f, direction: "all" })) });
  if (filters.type !== "all") chips.push({ label: filters.type === "sc" ? "SC CALL" : "TRANSFER", clear: () => setFilters((f) => ({ ...f, type: "all" })) });
  if (filters.minAmount || filters.maxAmount) {
    const label = filters.minAmount && filters.maxAmount
      ? `${formatQuCompact(filters.minAmount)}–${formatQuCompact(filters.maxAmount)} QU`
      : filters.minAmount ? `≥ ${formatQuCompact(filters.minAmount)} QU` : `≤ ${formatQuCompact(filters.maxAmount)} QU`;
    chips.push({ label, clear: () => { setFilters((f) => ({ ...f, minAmount: "", maxAmount: "" })); setDraft((d) => ({ ...d, minAmount: "", maxAmount: "" })); } });
  }
  if (filters.dateFrom || filters.dateTo) {
    const label = filters.dateFrom && filters.dateTo
      ? `${filters.dateFrom} – ${filters.dateTo}`
      : filters.dateFrom ? `FROM ${filters.dateFrom}` : `TO ${filters.dateTo}`;
    chips.push({ label, clear: () => { setFilters((f) => ({ ...f, dateFrom: "", dateTo: "" })); setDraft((d) => ({ ...d, dateFrom: "", dateTo: "" })); } });
  }
  if (filters.tickFrom || filters.tickTo) {
    const label = filters.tickFrom && filters.tickTo
      ? `TICK ${filters.tickFrom}–${filters.tickTo}`
      : filters.tickFrom ? `TICK ≥${filters.tickFrom}` : `TICK ≤${filters.tickTo}`;
    chips.push({ label, clear: () => { setFilters((f) => ({ ...f, tickFrom: "", tickTo: "" })); setDraft((d) => ({ ...d, tickFrom: "", tickTo: "" })); } });
  }

  return (
    <AppShell
      statusBar={
        <ScreenHeader
          title="Transactions"
          onBack={() => navigate("/dashboard")}
          action={
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
              {hasMemos && (
                <button type="button" onClick={exportMemos} aria-label="Export memos" style={ICON_BTN}>
                  <Download size={15} />
                </button>
              )}
              <button type="button" onClick={() => setFilterOpen(true)} aria-label="Filter" style={{ ...ICON_BTN, color: hasActive ? "var(--color-text-primary)" : "var(--color-text-secondary)", position: "relative" }}>
                <SlidersHorizontal size={15} />
                {hasActive && <span style={{ position: "absolute", top: -2, right: -3, width: 5, height: 5, borderRadius: "50%", background: "var(--color-status-success)" }} />}
              </button>
              <button type="button" onClick={() => refetch()} aria-label="Refresh" style={ICON_BTN}>
                <RotateCw size={15} />
              </button>
            </div>
          }
        />
      }
      contentStyle={{ padding: "var(--space-4)", display: "flex", flexDirection: "column" }}
    >
      {/* Active filter chips */}
      {chips.length > 0 && (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
          {chips.map((c) => <ActiveChip key={c.label} label={c.label} onRemove={c.clear} />)}
        </div>
      )}

      {/* States */}
      {isLoading && <StatusText color="var(--color-text-disabled)">[LOADING...]</StatusText>}
      {isError && <StatusText color="var(--color-status-error)">[NETWORK ERROR]</StatusText>}
      {!isLoading && !isError && filteredPending.length === 0 && filteredTxs.length === 0 && (
        <StatusText color="var(--color-text-disabled)">
          {allTxs.length === 0 && visiblePending.length === 0 ? "[NO TRANSACTIONS YET]" : "[NO RESULTS]"}
        </StatusText>
      )}

      {/* Transaction rows */}
      {!isLoading && !isError && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {filteredPending.map((p, i) => {
            const isIn = p.destination === identity;
            const expired = isExpired(p);
            return (
              <div key={`p-${p.hash}`}>
                {i > 0 && <Divider style={{ margin: "var(--space-3) 0" }} />}
                <button type="button" onClick={() => setDetail(p)} style={ROW_BTN}>
                  <TxRow
                    tag={<Tag variant={expired ? "error" : "warning"}>{expired ? "FAILED" : "PENDING"}</Tag>}
                    sub={p.contractName ?? (isIn ? truncateId(p.source) : truncateId(p.destination))}
                    sub2={expired ? `EXPIRED AT TICK ${p.targetTick}` : currentTick > 0 ? `ETA ~${Math.max(1, p.targetTick - currentTick)}s` : `TARGET ${p.targetTick}`}
                    amount={settings.hideBalances ? "••••••" : `−${formatQuCompact(p.amount)}`}
                    amountColor={expired ? "var(--color-text-disabled)" : "var(--color-status-warning)"}
                  />
                </button>
              </div>
            );
          })}

          {filteredTxs.map((tx, i) => {
            const isIn = tx.destination === identity;
            const contractName = tx.destination ? KNOWN_CONTRACT_ADDRESSES[tx.destination] : undefined;
            const fromContract = tx.source ? KNOWN_CONTRACT_ADDRESSES[tx.source] : undefined;
            const isSc = !!(contractName || fromContract);
            const flew = tx.moneyFlew;
            const variant = !flew ? "error" : isSc ? "neutral" : isIn ? "success" : "neutral";
            const label = !flew ? "FAILED" : isSc ? "SC CALL" : isIn ? "RECEIVED" : "SENT";

            // Resolve contract index from known address to look up procedure name
            const scAddress = contractName ? tx.destination : fromContract ? tx.source : null;
            const contractIndex = scAddress
              ? Object.entries(CONTRACT_NAMES).find(([, name]) => (contractName ?? fromContract) === name)?.[0]
              : null;
            const procedureName = contractIndex !== undefined && contractIndex !== null && tx.inputType !== null
              ? CONTRACT_PROCEDURE_NAMES[`${contractIndex}:${tx.inputType}`]
              : undefined;

            const counterparty = isSc
              ? procedureName
                ? `${contractName ?? fromContract} · ${procedureName}`
                : (contractName ?? fromContract ?? truncateId(isIn ? (tx.source ?? "—") : (tx.destination ?? "—")))
              : truncateId(isIn ? (tx.source ?? "—") : (tx.destination ?? "—"));
            const offset = filteredPending.length + i;
            return (
              <div key={tx.hash}>
                {offset > 0 && <Divider style={{ margin: "var(--space-3) 0" }} />}
                <button type="button" onClick={() => setDetail(tx)} style={ROW_BTN}>
                  <TxRow
                    tag={<Tag variant={variant}>{label}</Tag>}
                    sub={counterparty}
                    sub2={formatDate(tx.timestamp) || `TICK ${tx.tickNumber}`}
                    amount={settings.hideBalances ? "••••••" : `${isIn ? "+" : "−"}${formatQuCompact(tx.amount)}`}
                    amountColor={flew ? (isIn ? "var(--color-status-success)" : "var(--color-text-primary)") : "var(--color-text-disabled)"}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Infinite scroll */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {isFetchingNextPage && <StatusText color="var(--color-text-disabled)">[LOADING...]</StatusText>}
      {!hasNextPage && allTxs.length > 0 && <StatusText color="var(--color-text-disabled)">── END ──</StatusText>}

      {/* ── Filter sheet ────────────────────────────────────────────────────── */}
      <Sheet
        open={filterOpen}
        onClose={applyAndClose}
        title="Filter"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {hasActive ? (
              <button type="button" onClick={() => { setFilters(DEFAULT_FILTERS); setDraft(toDraft(DEFAULT_FILTERS)); setFilterOpen(false); }} style={GHOST_BTN}>
                RESET ALL
              </button>
            ) : <span />}
            <button type="button" onClick={applyAndClose} style={APPLY_BTN}>APPLY</button>
          </div>
        }
      >

        <FilterSection label="Direction">
          {(["all", "in", "out"] as const).map((v) => (
            <Pill key={v} label={v === "all" ? "ALL" : v.toUpperCase()} active={filters.direction === v} onClick={() => setFilters((f) => ({ ...f, direction: v }))} />
          ))}
        </FilterSection>

        <FilterSection label="Type">
          {(["all", "transfer", "sc"] as const).map((v) => (
            <Pill key={v} label={v === "all" ? "ALL" : v === "sc" ? "SC CALL" : "TRANSFER"} active={filters.type === v} onClick={() => setFilters((f) => ({ ...f, type: v }))} />
          ))}
        </FilterSection>

        <FilterSection label="Date range">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", width: "100%" }}>
            <Input type="date" value={draft.dateFrom} onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))} style={INPUT_SM} containerStyle={{ flex: 1 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", flexShrink: 0 }}>–</span>
            <Input type="date" value={draft.dateTo} onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))} style={INPUT_SM} containerStyle={{ flex: 1 }} />
          </div>
        </FilterSection>

        <FilterSection label="Amount (QU)">
          <RangeInputs
            fromValue={draft.minAmount} fromPlaceholder="Min"
            toValue={draft.maxAmount} toPlaceholder="Max"
            onFromChange={(v) => setDraft((d) => ({ ...d, minAmount: v }))}
            onToChange={(v) => setDraft((d) => ({ ...d, maxAmount: v }))}
          />
        </FilterSection>

        <FilterSection label="Tick range">
          <RangeInputs
            fromValue={draft.tickFrom} fromPlaceholder="From"
            toValue={draft.tickTo} toPlaceholder="To"
            onFromChange={(v) => setDraft((d) => ({ ...d, tickFrom: v }))}
            onToChange={(v) => setDraft((d) => ({ ...d, tickTo: v }))}
          />
        </FilterSection>

      </Sheet>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)}>
        {detail && <TxDetail detail={detail} identity={identity} currentTick={currentTick} txMemos={txMemos} />}
      </Modal>
    </AppShell>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const ICON_BTN: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: 0,
  display: "flex", alignItems: "center", color: "var(--color-text-secondary)",
};

const ROW_BTN: React.CSSProperties = {
  width: "100%", background: "none", border: "none", cursor: "pointer",
  padding: "var(--space-3) 0", textAlign: "left",
};

const INPUT_SM: React.CSSProperties = { fontSize: "var(--text-mono-sm)", padding: "8px 12px" };

const GHOST_BTN: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)",
  color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0,
};

const APPLY_BTN: React.CSSProperties = {
  background: "var(--color-text-primary)", border: "none",
  borderRadius: "var(--radius-sharp)", cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)",
  color: "var(--color-bg-base)", letterSpacing: "0.05em",
  padding: "var(--space-2) var(--space-4)",
};

const GHOST_BTN_DETAIL: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)",
  color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0,
};

const APPLY_BTN_DETAIL: React.CSSProperties = {
  background: "none", border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--radius-sharp)", cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)",
  color: "var(--color-text-primary)", letterSpacing: "0.05em",
  padding: "var(--space-1) var(--space-3)",
};

// ── UI sub-components ─────────────────────────────────────────────────────────

function TxRow({ tag, sub, sub2, amount, amountColor }: {
  tag: ReactNode; sub: string; sub2: string; amount: string; amountColor: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ marginBottom: "var(--space-1)" }}>{tag}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>{sub}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", marginTop: 2 }}>{sub2}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: "var(--space-3)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: amountColor }}>{amount}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>QU</div>
      </div>
    </div>
  );
}

function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: "var(--space-6)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "var(--space-3)" }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>{children}</div>
    </div>
  );
}

function RangeInputs({ fromValue, toValue, fromPlaceholder, toPlaceholder, onFromChange, onToChange }: {
  fromValue: string; toValue: string; fromPlaceholder: string; toPlaceholder: string;
  onFromChange: (v: string) => void; onToChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", width: "100%" }}>
      <Input value={fromValue} onChange={(e) => onFromChange(e.target.value)} placeholder={fromPlaceholder} inputMode="numeric" style={INPUT_SM} containerStyle={{ flex: 1 }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", flexShrink: 0 }}>–</span>
      <Input value={toValue} onChange={(e) => onToChange(e.target.value)} placeholder={toPlaceholder} inputMode="numeric" style={INPUT_SM} containerStyle={{ flex: 1 }} />
    </div>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      background: active ? "var(--color-text-primary)" : "none",
      border: `1px solid ${active ? "var(--color-text-primary)" : "var(--color-border-strong)"}`,
      borderRadius: "var(--radius-sharp)", cursor: "pointer",
      fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)",
      color: active ? "var(--color-bg-base)" : "var(--color-text-secondary)",
      letterSpacing: "0.05em", padding: "var(--space-1) var(--space-3)", textTransform: "uppercase",
    }}>
      {label}
    </button>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" onClick={onRemove} style={{
      background: "none", border: "1px solid var(--color-text-primary)",
      borderRadius: "var(--radius-sharp)", cursor: "pointer",
      fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)",
      color: "var(--color-text-primary)", letterSpacing: "0.05em",
      padding: "var(--space-1) var(--space-2)",
      display: "flex", alignItems: "center", gap: "var(--space-1)",
    }}>
      {label} ✕
    </button>
  );
}

function StatusText({ children, color }: { children: ReactNode; color: string }) {
  return (
    <div style={{ textAlign: "center", padding: "var(--space-12) 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color, letterSpacing: "0.05em" }}>
      {children}
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function TxDetail({ detail, identity, currentTick, txMemos }: {
  detail: TxHistoryItem | PendingTx; identity: string | null; currentTick: number;
  txMemos: Record<string, string>;
}) {
  const hideBalances = usePersistedStore((s) => s.settings.hideBalances);
  const setTxMemo = usePersistedStore((s) => s.setTxMemo);
  const deleteTxMemo = usePersistedStore((s) => s.deleteTxMemo);
  const isPending = (d: TxHistoryItem | PendingTx): d is PendingTx => "broadcastAt" in d;

  const hash = detail.hash ?? null;
  const [memo, setMemo] = useState(hash ? (txMemos[hash] ?? "") : "");
  const [memoEditing, setMemoEditing] = useState(false);

  function saveMemo() {
    if (!hash) return;
    if (memo.trim()) setTxMemo(hash, memo.trim());
    else deleteTxMemo(hash);
    setMemoEditing(false);
  }

  const contractName = detail.destination ? KNOWN_CONTRACT_ADDRESSES[detail.destination] : undefined;
  const fromContract = detail.source ? KNOWN_CONTRACT_ADDRESSES[detail.source] : undefined;
  const isSc = !!(contractName || fromContract);

  if (isPending(detail)) {
    const expired = currentTick > 0 && currentTick > detail.targetTick;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <Tag variant={expired ? "error" : "warning"}>{expired ? "FAILED" : "PENDING"}</Tag>
          {detail.contractName && <Tag variant="neutral">{detail.contractName}</Tag>}
        </div>
        <DetailRow label="Amount"><AmountVal amount={detail.amount ?? "0"} hide={hideBalances} /></DetailRow>
        <DetailRow label="From">{detail.source ? <IdentityDisplay identity={detail.source} /> : <Dash />}</DetailRow>
        <DetailRow label="To">{detail.destination ? <IdentityDisplay identity={detail.destination} /> : <Dash />}</DetailRow>
        <DetailRow label="Target tick"><MonoVal>{detail.targetTick}</MonoVal></DetailRow>
        {detail.hash && <DetailRow label="Hash"><IdentityDisplay identity={detail.hash} showIdenticon={false} /></DetailRow>}
      </div>
    );
  }

  const isIn = detail.destination === identity;
  const flew = detail.moneyFlew;
  const variant = !flew ? "error" : isSc ? "neutral" : isIn ? "success" : "neutral";
  const label = !flew ? "FAILED" : isSc ? "SC CALL" : isIn ? "RECEIVED" : "SENT";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <Tag variant={variant}>{label}</Tag>
        {isSc && <Tag variant="neutral">{contractName ?? fromContract ?? ""}</Tag>}
      </div>
      <DetailRow label="Amount"><AmountVal amount={detail.amount ?? "0"} hide={hideBalances} /></DetailRow>
      <DetailRow label="From">{detail.source ? <IdentityDisplay identity={detail.source} /> : <Dash />}</DetailRow>
      <DetailRow label="To">{detail.destination ? <IdentityDisplay identity={detail.destination} /> : <Dash />}</DetailRow>
      <DetailRow label="Tick"><MonoVal>{detail.tickNumber ?? "—"}</MonoVal></DetailRow>
      {detail.hash && <DetailRow label="Hash"><IdentityDisplay identity={detail.hash} showIdenticon={false} /></DetailRow>}

      {hash && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Note</span>
            {!memoEditing && (
              <button type="button" onClick={() => setMemoEditing(true)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0 }}>
                {memo.trim() ? "EDIT" : "+ ADD"}
              </button>
            )}
          </div>
          {memoEditing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <textarea
                autoFocus
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Add a note to this transaction..."
                rows={3}
                style={{
                  width: "100%",
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border-strong)",
                  borderRadius: "var(--radius-sharp)",
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-mono-sm)",
                  letterSpacing: "0.04em",
                  lineHeight: 1.6,
                  padding: "var(--space-2) var(--space-3)",
                  resize: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-3)" }}>
                <button type="button" onClick={() => { setMemo(hash ? (txMemos[hash] ?? "") : ""); setMemoEditing(false); }} style={GHOST_BTN_DETAIL}>CANCEL</button>
                <button type="button" onClick={saveMemo} style={APPLY_BTN_DETAIL}>SAVE</button>
              </div>
            </div>
          ) : memo.trim() ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.04em", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{memo.trim()}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      {children}
    </div>
  );
}

function AmountVal({ amount, hide }: { amount: string; hide: boolean }) {
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-text-display)" }}>{hide ? "••••••" : `${formatQu(amount)} QU`}</span>;
}

function MonoVal({ children }: { children: ReactNode }) {
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)" }}>{children}</span>;
}

function Dash() {
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)" }}>—</span>;
}
