import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { Tag } from "@/components/tag";
import { Divider } from "@/components/divider";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useAutoLock } from "@/hooks/use-auto-lock";
import { useTxHistory } from "@/hooks/use-tx-history";

function formatAmount(amount: string | undefined): string {
  if (!amount) return "—";
  const n = BigInt(amount);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function truncate(id: string): string {
  if (!id || id.length <= 16) return id;
  return `${id.slice(0, 8)}...${id.slice(-8)}`;
}

export default function HistoryScreen() {
  const navigate = useNavigate();
  useAutoLock();

  const settings = usePersistedStore((s) => s.settings);
  const wallets = useSessionStore((s) => s.wallets);
  const identity = wallets[settings.activeAccountIndex]?.identity ?? null;

  const { data: txs, isLoading, isError } = useTxHistory(identity);

  const statusBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <button onClick={() => navigate("/dashboard")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}>
        ← BACK
      </button>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Transactions
      </span>
      <span style={{ width: 40 }} />
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
    if (!txs || txs.length === 0) return (
      <div style={{ textAlign: "center", padding: "var(--space-12) 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
        [NO TRANSACTIONS YET]
      </div>
    );
    return txs.map((tx, i) => {
      const isIncoming = tx.destination === identity;
      const amount = formatAmount(tx.amount);
      const moneyFlew = tx.moneyFlew ?? true;
      const statusVariant = moneyFlew ? (isIncoming ? "success" : "neutral") : "error";
      const statusLabel = moneyFlew ? (isIncoming ? "RECEIVED" : "SENT") : "FAILED";
      return (
        <div key={tx.hash ?? i}>
          {i > 0 && <Divider style={{ margin: "var(--space-3) 0" }} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                <Tag variant={statusVariant}>{statusLabel}</Tag>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                {isIncoming ? truncate(tx.source ?? "—") : truncate(tx.destination ?? "—")}
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
                {isIncoming ? "+" : "−"}{amount}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                QU
              </div>
            </div>
          </div>
        </div>
      );
    });
  };

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-4)" }}>
      {body()}
    </AppShell>
  );
}
