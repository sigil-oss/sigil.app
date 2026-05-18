import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, ArrowUp, ArrowDown, Clock, Settings } from "lucide-react";
import { AppShell } from "@/layouts/app-shell";
import { Modal } from "@/components/modal";
import { Tag } from "@/components/tag";
import { IdentityDisplay } from "@/components/identity-display";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useBalance } from "@/hooks/use-balance";
import { useTickInfo } from "@/hooks/use-tick-info";
import { useNetworkHealth } from "@/hooks/use-network-health";
import { useAutoLock } from "@/hooks/use-auto-lock";

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

function formatBalance(amount: bigint): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
        { icon: Settings, label: "SETTINGS", active: false, action: () => navigate("/vaults") },
      ].map(({ icon: Icon, label, active, action }) => (
        <button
          key={label}
          onClick={action}
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
        <div style={{ textAlign: "center", padding: "var(--space-8) 0" }}>
          {settings.hideBalances ? (
            <span style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "var(--text-display)", color: "var(--color-text-disabled)" }}>
              ••••••
            </span>
          ) : (
            <div style={{ display: "inline-flex", alignItems: "baseline", gap: "var(--space-2)" }}>
              <span style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "var(--text-display)", color: "var(--color-text-display)", letterSpacing: "-0.02em" }}>
                {balanceLoading ? "[LOADING...]" : balance ? formatBalance(balance.balance) : "—"}
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

        {/* Transaction history placeholder */}
        <div style={{ textAlign: "center", padding: "var(--space-12) 0" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            [NO TRANSACTIONS YET]
          </span>
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
