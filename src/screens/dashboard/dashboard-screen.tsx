import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { animate } from "motion/react";
import { Eye, EyeOff } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
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
import { useTxHistory } from "@/hooks/use-tx-history";
import { useLatestStats } from "@/hooks/use-latest-stats";
import { Divider } from "@/components/divider";
import { truncateId, formatQu, formatQuCompact } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { Identicon } from "@/components/identicon";

const HEALTH_COLOR: Record<string, string> = {
  healthy: "var(--color-status-success)",
  degraded: "var(--color-status-warning)",
  offline: "var(--color-status-error)",
};

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
      onComplete: () => {
        if (spanRef.current) spanRef.current.textContent = formatQu(value);
      },
    });
    return () => controls.stop();
  }, [num]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span ref={spanRef} aria-live="polite" aria-atomic="true">
      {formatQu(value)}
    </span>
  );
}

function padTick(tick: number | undefined): string {
  if (!tick) return "--------";
  return tick.toString().padStart(8, "0");
}

export default function DashboardScreen() {
  const navigate = useNavigate();

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
  const { data: stats } = useLatestStats();
  const txAlerts = useSessionStore((s) => s.txAlerts);
  const dismissTxAlert = useSessionStore((s) => s.dismissTxAlert);
  const bobTick = useSessionStore((s) => s.bobTick);
  const bobConnected = useSessionStore((s) => s.bobConnected);
  const bobSyncLag = useSessionStore((s) => s.bobSyncLag);

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
        aria-label={`Switch vault — ${vault?.name ?? "none"}`}
        style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        {vault ? (
          <Identicon seed={`${vault.id}:${vault.color}`} size={18} radius={3} />
        ) : (
          <div style={{ width: 18, height: 18, borderRadius: 3, background: "var(--color-text-disabled)" }} />
        )}
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {vault?.name ?? "—"}
        </span>
      </button>

      <button
        onClick={() => setShowNetworkOverlay(true)}
        aria-label="Network status"
        style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
          {bobConnected && bobTick ? (
            <span>
              <span style={{ color: "var(--color-status-warning)" }}>◆ </span>
              {padTick(bobTick)}
            </span>
          ) : (
            `TICK #${padTick(tickInfo?.tick)}`
          )}
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

  return (
    <AppShell statusBar={statusBar} bottomNav={<BottomNav active="home" />} contentStyle={{ padding: "var(--space-6)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

        {/* Failed/expired tx alerts */}
        {txAlerts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {txAlerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  padding: "var(--space-3) var(--space-4)",
                  background: "var(--color-bg-surface)",
                  border: "1px solid var(--color-status-error)",
                  borderRadius: "var(--radius-sharp)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
                    [{alert.reason === "expired" ? "TICK MISSED" : "TX FAILED"}] {alert.label}
                  </span>
                </div>
                <button
                  onClick={() => dismissTxAlert(alert.id)}
                  aria-label="Dismiss"
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0, flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

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
          {balance && !balanceLoading && tickInfo?.tick && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", marginTop: "var(--space-2)", letterSpacing: "0.05em" }}>
              AS OF TICK {tickInfo.tick}
            </div>
          )}
          {balance && !balanceLoading && !settings.hideBalances && stats?.price && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", marginTop: "var(--space-1)", letterSpacing: "0.05em" }}>
              ≈ ${(Number(balance.balance) * stats.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
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
          {settings.network.useBobNode && (
            <NetworkRow
              label="Bob node"
              value={bobConnected ? `LIVE #${padTick(bobTick ?? undefined)}` : "connecting..."}
            />
          )}
          {settings.network.useBobNode && bobSyncLag !== null && (
            <NetworkRow
              label="Bob sync lag"
              value={`${bobSyncLag} tick${bobSyncLag === 1 ? "" : "s"}`}
              warn={bobSyncLag > 10}
            />
          )}
        </div>
      </Modal>
    </AppShell>
  );
}

interface RecentTxsProps {
  identity: string | null;
  activeIdentity: string | null;
  hideBalances: boolean;
  onViewAll: () => void;
}

function RecentTxs({ identity, activeIdentity, hideBalances, onViewAll }: RecentTxsProps) {
  const { data, isLoading } = useTxHistory(identity);
  const txs = data?.pages[0];
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
    if (hasReady) queryClient.invalidateQueries({ queryKey: qk.txHistory(identity) });
  }, [lastProcessedTick, pendingTxs, identity, queryClient]);

  // Cleanup confirmed-only: txs that appeared in history are done regardless of notifications.
  // Expiry cleanup is handled solely by useNotificationTriggers (after +30 live ticks) so
  // expired txs stay visible as "FAILED" until that hook removes them with a proper alert.
  useEffect(() => {
    if (!txs || !lastProcessedTick) return;
    const fetchedHashes = new Set(txs.map((t) => t.hash));
    pendingTxs.forEach((p) => {
      if (fetchedHashes.has(p.hash)) removePendingTx(p.hash);
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
                  {truncateId(isIn ? p.source : p.destination)}
                </span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: expired ? "var(--color-text-disabled)" : "var(--color-status-warning)" }}>
                {hideBalances ? "••••••" : `${isIn ? "+" : "−"}${formatQuCompact(p.amount ?? "0")}`}
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
          <div key={tx.hash}>
            {offset > 0 && <Divider style={{ marginBottom: "var(--space-3)" }} />}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                <Tag variant={statusVariant}>{statusLabel}</Tag>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                  {truncateId(isIn ? (tx.source ?? "—") : (tx.destination ?? "—"))}
                </span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: amountColor }}>
                {hideBalances ? "••••••" : `${isIn ? "+" : "−"}${formatQuCompact(tx.amount ?? "0")}`}
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

function NetworkRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: warn ? "var(--color-status-warning)" : "var(--color-text-primary)", letterSpacing: "0.05em", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}
