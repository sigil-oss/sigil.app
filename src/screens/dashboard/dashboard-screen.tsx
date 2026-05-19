import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { animate } from "motion/react";
import { Home, ArrowUp, ArrowDown, Clock, Settings, Eye, EyeOff } from "lucide-react";
import { AppShell } from "@/layouts/app-shell";
import { Modal } from "@/components/modal";
import { Tag } from "@/components/tag";
import { IdentityDisplay } from "@/components/identity-display";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useBalance } from "@/hooks/use-balance";
import { useTickInfo } from "@/hooks/use-tick-info";
import { useLastProcessedTick } from "@/hooks/use-last-processed-tick";
import { useNetworkHealth } from "@/hooks/use-network-health";
import { useAutoLock } from "@/hooks/use-auto-lock";
import { useTxHistory } from "@/hooks/use-tx-history";
import { Divider } from "@/components/divider";

const VAULT_COLOR_CSS: Record<string, string> = {
  slate: "var(--color-vault-slate)",
  red: "var(--color-vault-red)",
  amber: "var(--color-vault-amber)",
  emerald: "var(--color-vault-emerald)",
  sky: "var(--color-vault-sky)",
  violet: "var(--color-vault-violet)",
};

const HEALTH_COLOR: Record<string, string> = {
  healthy: "var(--color-status-success)",
  degraded: "var(--color-status-warning)",
  offline: "var(--color-status-error)",
};

function formatQu(amount: number): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function AnimatedBalance({ value }: { value: bigint }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const prevRef = useRef<number | null>(null);
  const num = Number(value);

  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = num;
      return;
    }
    const from = prevRef.current;
    prevRef.current = num;
    const controls = animate(from, num, {
      duration: 0.5,
      ease: "easeOut",
      onUpdate: (v) => {
        if (spanRef.current) spanRef.current.textContent = formatQu(v);
      },
    });
    return () => controls.stop();
  }, [num]);

  return (
    <span ref={spanRef} aria-live="polite" aria-atomic="true">
      {formatQu(num)}
    </span>
  );
}

function padTick(tick: number | undefined): string {
  if (!tick) return "--------";
  return tick.toString().padStart(8, "0");
}

export default function DashboardScreen() {
  const navigate = useNavigate();
  useAutoLock();

  const vaults = usePersistedStore((s) => s.vaults);
  const settings = usePersistedStore((s) => s.settings);
  const setActiveAccountIndex = usePersistedStore((s) => s.setActiveAccountIndex);
  const updateSettings = usePersistedStore((s) => s.updateSettings);

  const isLocked = useSessionStore((s) => s.isLocked);
  const wallets = useSessionStore((s) => s.wallets);

  const vault = vaults.find((v) => v.id === settings.activeVaultId) ?? vaults[0] ?? null;
  const activeIndex = settings.activeAccountIndex;
  const wallet = wallets[activeIndex] ?? null;
  const identity = wallet?.identity ?? null;

  const { data: balance, isLoading: balanceLoading } = useBalance(identity);
  const { data: tickInfo, dataUpdatedAt } = useTickInfo();
  const health = useNetworkHealth();

  const [showNetworkOverlay, setShowNetworkOverlay] = useState(false);

  useEffect(() => {
    if (isLocked) navigate("/lock", { replace: true });
  }, [isLocked, navigate]);

  const visibleAccounts =
    vault?.accounts.filter((a) => !a.hidden).sort((a, b) => a.index - b.index) ?? [];

  const statusBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <button
        onClick={() => navigate("/vaults")}
        style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <div
          style={{
            width: 8, height: 8, borderRadius: "50%",
            background: vault ? (VAULT_COLOR_CSS[vault.color] ?? "var(--color-text-secondary)") : "var(--color-text-disabled)",
          }}
        />
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {vault?.name ?? "—"}
        </span>
      </button>

      <button
        onClick={() => setShowNetworkOverlay(true)}
        style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
          TICK #{padTick(tickInfo?.tick)}
        </span>
        <div
          style={{
            width: 6, height: 6, borderRadius: "50%",
            background: HEALTH_COLOR[health],
          }}
        />
      </button>
    </div>
  );

  const bottomNav = (
    <>
      {[
        { icon: Home, label: "HOME", active: true, action: () => {} },
        { icon: ArrowUp, label: "SEND", active: false, action: () => navigate("/send") },
        { icon: ArrowDown, label: "RECEIVE", active: false, action: () => navigate("/receive") },
        { icon: Clock, label: "HISTORY", active: false, action: () => navigate("/history") },
        { icon: Settings, label: "SETTINGS", active: false, action: () => navigate("/settings") },
      ].map(({ icon: Icon, label, active, action }) => (
        <button
          key={label}
          onClick={action}
          aria-current={active ? "page" : undefined}
          style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
            background: "none", border: "none", cursor: "pointer", padding: 0,
            color: active ? "var(--color-text-display)" : "var(--color-text-disabled)",
          }}
        >
          <Icon size={16} strokeWidth={1.5} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", letterSpacing: "0.05em" }}>
            {label}
          </span>
        </button>
      ))}
    </>
  );

  return (
    <AppShell statusBar={statusBar} bottomNav={bottomNav} contentStyle={{ padding: "var(--space-6)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

        {/* Identity + account name */}
        {identity ? (
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
              {vault?.accounts[activeIndex]?.name ?? `Account ${activeIndex + 1}`}
            </div>
            <IdentityDisplay identity={identity} />
          </div>
        ) : (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            [NO ACCOUNT]
          </div>
        )}

        {/* Balance hero */}
        <div style={{ textAlign: "center", padding: "var(--space-8) 0", position: "relative" }}>
          <button
            onClick={() => updateSettings({ hideBalances: !settings.hideBalances })}
            aria-label={settings.hideBalances ? "Show balances" : "Hide balances"}
            style={{ position: "absolute", top: 0, right: 0, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-disabled)", padding: 0, display: "flex", alignItems: "center" }}
          >
            {settings.hideBalances ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
          </button>
          {settings.hideBalances ? (
            <span style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "var(--text-display)", color: "var(--color-text-disabled)" }}>
              ••••••
            </span>
          ) : (
            <div style={{ display: "inline-flex", alignItems: "baseline", gap: "var(--space-2)" }}>
              <span style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "var(--text-display)", color: "var(--color-text-display)", letterSpacing: "-0.02em" }}>
                {balanceLoading ? "[LOADING...]" : balance ? <AnimatedBalance value={balance.balance} /> : "—"}
              </span>
              {!balanceLoading && balance && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-text-secondary)" }}>
                  QU
                </span>
              )}
            </div>
          )}
          {balance && !balanceLoading && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", marginTop: "var(--space-2)", letterSpacing: "0.05em" }}>
              AS OF TICK {balance.validForTick}
            </div>
          )}
        </div>

        {/* Account switcher */}
        {visibleAccounts.length > 1 && (
          <div style={{ display: "flex", gap: "var(--space-2)", overflowX: "auto", paddingBottom: "var(--space-1)" }}>
            {visibleAccounts.map((account) => (
              <button
                key={account.index}
                onClick={() => setActiveAccountIndex(account.index)}
                style={{
                  flexShrink: 0,
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-pill)",
                  border: "1px solid",
                  borderColor: account.index === activeIndex ? "var(--color-text-display)" : "var(--color-border-strong)",
                  background: account.index === activeIndex ? "var(--color-text-display)" : "transparent",
                  color: account.index === activeIndex ? "var(--color-bg-base)" : "var(--color-text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-mono-sm)",
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {account.name}
              </button>
            ))}
          </div>
        )}

        {/* Recent transactions */}
        <RecentTxs identity={identity} activeIdentity={identity} hideBalances={settings.hideBalances} onViewAll={() => navigate("/history")} />

        {/* Utility shortcuts */}
        <div style={{ display: "flex", justifyContent: "center", gap: "var(--space-6)" }}>
          <button onClick={() => navigate("/stake")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0 }}>
            QEARN →
          </button>
          <button onClick={() => navigate("/send-many")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0 }}>
            SEND MANY →
          </button>
        </div>

      </div>

      {/* Network health overlay */}
      <Modal open={showNetworkOverlay} onClose={() => setShowNetworkOverlay(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Network
            </span>
            <Tag variant={health === "healthy" ? "success" : health === "degraded" ? "warning" : "error"}>
              {health.toUpperCase()}
            </Tag>
          </div>
          <NetworkRow label="RPC" value={settings.network.liveApiUrl} />
          <NetworkRow label="Tick" value={tickInfo?.tick ? `#${padTick(tickInfo.tick)}` : "—"} />
          <NetworkRow
            label="Updated"
            value={dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"}
          />
        </div>
      </Modal>
    </AppShell>
  );
}

function truncate(id: string): string {
  if (!id || id.length <= 16) return id;
  return `${id.slice(0, 8)}...${id.slice(-8)}`;
}

function formatAmount(amount: string | undefined): string {
  if (!amount) return "—";
  return BigInt(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

interface RecentTxsProps {
  identity: string | null;
  activeIdentity: string | null;
  hideBalances: boolean;
  onViewAll: () => void;
}

function RecentTxs({ identity, activeIdentity, hideBalances, onViewAll }: RecentTxsProps) {
  const { data: txs, isLoading } = useTxHistory(identity);
  const pendingTxs = usePersistedStore((s) => s.pendingTxs);
  const removePendingTx = usePersistedStore((s) => s.removePendingTx);
  const { data: lastProcessedTickData } = useLastProcessedTick();
  const queryClient = useQueryClient();
  const lastProcessedTick = lastProcessedTickData?.tickNumber ?? 0;

  const isExpired = (p: { targetTick: number }) =>
    lastProcessedTick > 0 && lastProcessedTick >= p.targetTick;

  // When any pending tx's target tick is processed, immediately refresh history
  useEffect(() => {
    if (!lastProcessedTick || !identity) return;
    const hasReady = pendingTxs.some(
      (p) => (p.source === identity || p.destination === identity) && lastProcessedTick >= p.targetTick,
    );
    if (hasReady) queryClient.invalidateQueries({ queryKey: ["tx-history", identity] });
  }, [lastProcessedTick, pendingTxs, identity, queryClient]);

  // Cleanup: confirmed txs remove immediately; expired remove once tick is processed
  useEffect(() => {
    if (!txs || !lastProcessedTick) return;
    const fetchedHashes = new Set(txs.map((t) => t.hash).filter(Boolean));
    pendingTxs.forEach((p) => {
      if (fetchedHashes.has(p.hash)) removePendingTx(p.hash);
      else if (lastProcessedTick >= p.targetTick) removePendingTx(p.hash);
    });
  }, [txs, pendingTxs, removePendingTx, lastProcessedTick]);

  const myPending = pendingTxs
    .filter((p) => p.source === activeIdentity || p.destination === activeIdentity)
    .slice(0, 3);

  const recent = (txs ?? []).slice(0, 5 - Math.min(myPending.length, 3));
  const hasAny = myPending.length > 0 || recent.length > 0;

  if (isLoading && !hasAny) {
    return (
      <div style={{ textAlign: "center", padding: "var(--space-8) 0" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
          [LOADING...]
        </span>
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div style={{ textAlign: "center", padding: "var(--space-8) 0" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
          [NO TRANSACTIONS YET]
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {myPending.map((p, i) => {
        const isIn = p.destination === activeIdentity;
        const expired = isExpired(p);
        return (
          <div key={p.hash}>
            {i > 0 && <Divider style={{ marginBottom: "var(--space-3)" }} />}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                <Tag variant={expired ? "error" : "warning"}>{expired ? "FAILED" : "PENDING"}</Tag>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                  {truncate(isIn ? p.source : p.destination)}
                </span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: expired ? "var(--color-text-disabled)" : "var(--color-status-warning)" }}>
                {hideBalances ? "••••••" : `${isIn ? "+" : "−"}${formatAmount(p.amount)}`}
              </span>
            </div>
          </div>
        );
      })}

      {recent.map((tx, i) => {
        const isIn = tx.destination === activeIdentity;
        const flew = tx.moneyFlew ?? true;
        const statusVariant = flew ? (isIn ? "success" : "neutral") : "error";
        const statusLabel = flew ? (isIn ? "RECEIVED" : "SENT") : "FAILED";
        const amountColor = flew
          ? isIn ? "var(--color-status-success)" : "var(--color-text-primary)"
          : "var(--color-text-disabled)";
        const offset = myPending.length + i;
        return (
          <div key={tx.hash ?? i}>
            {offset > 0 && <Divider style={{ marginBottom: "var(--space-3)" }} />}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                <Tag variant={statusVariant}>{statusLabel}</Tag>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                  {truncate(isIn ? (tx.source ?? "—") : (tx.destination ?? "—"))}
                </span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: amountColor }}>
                {hideBalances ? "••••••" : `${isIn ? "+" : "−"}${formatAmount(tx.amount)}`}
              </span>
            </div>
          </div>
        );
      })}

      <button
        onClick={onViewAll}
        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: "var(--space-2) 0", textAlign: "right" }}
      >
        VIEW ALL →
      </button>
    </div>
  );
}

function NetworkRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}
