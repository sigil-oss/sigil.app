import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { Tag } from "@/components/tag";
import { Divider } from "@/components/divider";
import { useVaultAnalytics } from "@/hooks/use-vault-analytics";
import { usePersistedStore } from "@/store/persisted";
import { KNOWN_CONTRACT_ADDRESSES } from "@/lib/contracts";
import { truncateId, formatDate, formatQuCompact } from "@/lib/format";
import type { MonthlySummaryStat, DailyActivityStat } from "@/lib/history-analytics";

const FMT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 });
function compactQu(value: bigint): string {
  return FMT.format(Number(value));
}

export default function AnalyticsScreen() {
  const navigate = useNavigate();
  const { data: analytics, isLoading } = useVaultAnalytics();
  const priceAlerts = usePersistedStore((s) =>
    s.notificationEvents.filter((e) => e.kind === "price_alert").slice(0, 10),
  );

  return (
    <AppShell
      statusBar={<ScreenHeader title="Analytics" onBack={() => navigate("/history")} />}
      contentStyle={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-8)" }}
    >
      {isLoading && !analytics && (
        <div style={{ textAlign: "center", padding: "var(--space-12) 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.08em" }}>
          [LOADING...]
        </div>
      )}

      {!isLoading && !analytics && (
        <div style={{ textAlign: "center", padding: "var(--space-12) 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.08em" }}>
          [NO DATA YET]
        </div>
      )}

      {analytics && (
        <>
          {/* ── Hero: Net flow ─────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-label)", color: "var(--color-text-disabled)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Net flow
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)" }}>
              <span style={{
                fontFamily: "var(--font-display)",
                fontWeight: 400,
                fontSize: "var(--text-display)",
                letterSpacing: "-0.02em",
                color: analytics.netFlow >= 0n
                  ? "var(--color-status-success)"
                  : "var(--color-status-warning)",
              }}>
                {analytics.netFlow >= 0n ? "+" : "−"}{compactQu(analytics.netFlow >= 0n ? analytics.netFlow : -analytics.netFlow)}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-text-disabled)" }}>
                QU
              </span>
            </div>
            <Tag variant={analytics.netFlow >= 0n ? "success" : "warning"}>
              {analytics.netFlow >= 0n ? "NET IN" : "NET OUT"}
            </Tag>
          </div>

          {/* ── In / Out flow bar ──────────────────────────────────────── */}
          <FlowBar incoming={analytics.totalIncoming} outgoing={analytics.totalOutgoing} />

          {/* ── Monthly breakdown ──────────────────────────────────────── */}
          {analytics.monthlySummaries.length > 0 && (
            <>
              <Divider />
              <Section label="Monthly breakdown">
                <MonthlyBars summaries={analytics.monthlySummaries} />
              </Section>
            </>
          )}

          {/* ── Counterparties ─────────────────────────────────────────── */}
          {analytics.biggestCounterparties.length > 0 && (
            <>
              <Divider />
              <Section label="Top counterparties">
                {analytics.biggestCounterparties.map((item) => (
                  <DataRow
                    key={item.identity}
                    primary={KNOWN_CONTRACT_ADDRESSES[item.identity] ?? truncateId(item.identity, 10, 8)}
                    secondary={`${item.count} tx`}
                    value={`${compactQu(item.volume)} QU`}
                  />
                ))}
              </Section>
            </>
          )}

          {/* ── Contract usage ─────────────────────────────────────────── */}
          {analytics.contractUsage.length > 0 && (
            <>
              <Divider />
              <Section label="Contract usage">
                {analytics.contractUsage.map((item) => (
                  <DataRow
                    key={item.contract}
                    primary={item.contract}
                    secondary={`${item.count} calls`}
                    value={`${compactQu(item.volume)} QU`}
                  />
                ))}
              </Section>
            </>
          )}

          {/* ── Summary stats ──────────────────────────────────────────── */}
          <Divider />
          <Section label="Summary">
            <DataRow primary="Total transactions" secondary="" value={String(analytics.txCount)} />
            <DataRow primary="Avg. transaction" secondary="" value={`${formatQuCompact(analytics.avgTxAmount)} QU`} />
          </Section>

          {/* ── Activity heatmap ───────────────────────────────────────── */}
          {analytics.dailyActivity.length > 0 && (
            <>
              <Divider />
              <Section label="Activity (last 12 weeks)">
                <ActivityHeatmap days={analytics.dailyActivity} />
              </Section>
            </>
          )}
        </>
      )}

      {/* ── Price alert breach history ──────────────────────────────────── */}
      {priceAlerts.length > 0 && (
        <>
          <Divider />
          <Section label="Price alerts">
            {priceAlerts.map((event) => (
              <DataRow
                key={event.id}
                primary={event.title}
                secondary={formatDate(event.createdAt)}
                value={event.body}
              />
            ))}
          </Section>
        </>
      )}
    </AppShell>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FlowBar({ incoming, outgoing }: { incoming: bigint; outgoing: bigint }) {
  const total = incoming + outgoing;
  const inPct = total > 0n ? Number((incoming * 1000n) / total) / 10 : 50;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {/* Proportional bar */}
      <div style={{ height: 8, display: "flex", overflow: "hidden", borderRadius: 0, background: "var(--color-border-strong)" }}>
        <div style={{ width: `${inPct}%`, background: "var(--color-status-success)", transition: "width 0.3s ease-out" }} />
      </div>
      {/* Labels */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-label)", color: "var(--color-status-success)", letterSpacing: "0.08em", textTransform: "uppercase" }}>IN</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-status-success)", letterSpacing: "0.03em" }}>{compactQu(incoming)} QU</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "right" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-label)", color: "var(--color-text-disabled)", letterSpacing: "0.08em", textTransform: "uppercase" }}>OUT</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-lg)", color: "var(--color-text-primary)", letterSpacing: "0.03em" }}>{compactQu(outgoing)} QU</span>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-label)", color: "var(--color-text-disabled)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function DataRow({ primary, secondary, value }: { primary: string; secondary: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {primary}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.04em" }}>
          {secondary}
        </span>
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.04em", whiteSpace: "nowrap", flexShrink: 0 }}>
        {value}
      </span>
    </div>
  );
}

function ActivityHeatmap({ days }: { days: DailyActivityStat[] }) {
  const max = Math.max(...days.map((d) => d.count), 1);
  const dayMap = new Map(days.map((d) => [d.date, d.count]));

  // Build 12-week grid ending today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cells: { date: string; count: number }[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, count: dayMap.get(key) ?? 0 });
  }

  // Split into 12 columns of 7 days each
  const weeks: typeof cells[] = [];
  for (let w = 0; w < 12; w++) weeks.push(cells.slice(w * 7, w * 7 + 7));

  return (
    <div style={{ display: "flex", gap: 3 }}>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {week.map((cell) => {
            const intensity = cell.count === 0 ? 0 : Math.max(0.15, cell.count / max);
            return (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.count} tx`}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: cell.count === 0
                    ? "var(--color-border-strong)"
                    : `color-mix(in srgb, var(--color-status-success) ${Math.round(intensity * 100)}%, var(--color-border-strong))`,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MonthlyBars({ summaries }: { summaries: MonthlySummaryStat[] }) {
  const maxVolume = summaries.reduce((m, s) => {
    const total = s.incoming + s.outgoing;
    return total > m ? total : m;
  }, 0n);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {summaries.map((s) => {
        const inPct = maxVolume > 0n ? Number((s.incoming * 1000n) / maxVolume) / 10 : 0;
        const outPct = maxVolume > 0n ? Number((s.outgoing * 1000n) / maxVolume) / 10 : 0;
        return (
          <div key={s.sortKey} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {s.month}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-label)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                {s.count} tx
              </span>
            </div>
            {/* Incoming bar */}
            {s.incoming > 0n && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <div style={{ width: 20, fontFamily: "var(--font-mono)", fontSize: "var(--text-label)", color: "var(--color-status-success)", letterSpacing: "0.04em", flexShrink: 0 }}>IN</div>
                <div style={{ flex: 1, height: 6, background: "var(--color-border-strong)", borderRadius: 0, overflow: "hidden" }}>
                  <div style={{ width: `${inPct}%`, height: "100%", background: "var(--color-status-success)" }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", letterSpacing: "0.03em", width: 64, textAlign: "right", flexShrink: 0 }}>
                  {compactQu(s.incoming)}
                </span>
              </div>
            )}
            {/* Outgoing bar */}
            {s.outgoing > 0n && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <div style={{ width: 20, fontFamily: "var(--font-mono)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", letterSpacing: "0.04em", flexShrink: 0 }}>OUT</div>
                <div style={{ flex: 1, height: 6, background: "var(--color-border-strong)", borderRadius: 0, overflow: "hidden" }}>
                  <div style={{ width: `${outPct}%`, height: "100%", background: "var(--color-text-secondary)" }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", letterSpacing: "0.03em", width: 64, textAlign: "right", flexShrink: 0 }}>
                  {compactQu(s.outgoing)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
