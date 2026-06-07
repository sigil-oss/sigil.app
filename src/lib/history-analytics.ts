import { KNOWN_CONTRACT_ADDRESSES } from "@/lib/contracts";
import type { PriceSnapshot } from "@/store/persisted";

export interface AnalyticsTxLike {
  hash: string;
  source: string | null;
  destination: string | null;
  amount: string;
  timestamp: number | null;
  moneyFlew: boolean;
}

export interface CounterpartyStat {
  identity: string;
  label: string;
  count: number;
  volume: bigint;
}

export interface ContractUsageStat {
  contract: string;
  count: number;
  volume: bigint;
}

export interface MonthlySummaryStat {
  month: string;
  sortKey: number;
  incoming: bigint;
  outgoing: bigint;
  count: number;
}

export interface DailyActivityStat {
  date: string;
  count: number;
}

export interface VaultAnalyticsSummary {
  netFlow: bigint;
  totalIncoming: bigint;
  totalOutgoing: bigint;
  txCount: number;
  avgTxAmount: bigint;
  biggestCounterparties: CounterpartyStat[];
  contractUsage: ContractUsageStat[];
  monthlySummaries: MonthlySummaryStat[];
  dailyActivity: DailyActivityStat[];
}

export function findClosestPriceSnapshot(timestamp: number | null, snapshots: PriceSnapshot[]): PriceSnapshot | null {
  if (!timestamp || snapshots.length === 0) return null;
  let best: PriceSnapshot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const snapshot of snapshots) {
    const distance = Math.abs(snapshot.timestamp - timestamp);
    if (distance < bestDistance) {
      best = snapshot;
      bestDistance = distance;
    }
  }
  return best;
}

export function buildVaultAnalytics(identitySet: Set<string>, txs: AnalyticsTxLike[]): VaultAnalyticsSummary {
  let totalIncoming = 0n;
  let totalOutgoing = 0n;
  let txCount = 0;
  const counterparties = new Map<string, CounterpartyStat>();
  const contractUsage = new Map<string, ContractUsageStat>();
  const monthly = new Map<number, MonthlySummaryStat>();
  const daily = new Map<string, number>();

  for (const tx of txs) {
    if (!tx.moneyFlew) continue;
    const amount = BigInt(tx.amount || "0");
    const sourceMine = !!tx.source && identitySet.has(tx.source);
    const destinationMine = !!tx.destination && identitySet.has(tx.destination);
    if (!sourceMine && !destinationMine) continue;

    txCount += 1;

    const txDate = tx.timestamp ? new Date(tx.timestamp) : null;

    if (txDate) {
      const dateKey = txDate.toISOString().slice(0, 10);
      daily.set(dateKey, (daily.get(dateKey) ?? 0) + 1);
    }

    const monthSortKey = txDate ? txDate.getFullYear() * 100 + (txDate.getMonth() + 1) : -1;
    const monthLabel = txDate
      ? txDate.toLocaleDateString(undefined, { year: "numeric", month: "short" })
      : "Unknown";
    const month = monthly.get(monthSortKey) ?? {
      month: monthLabel,
      sortKey: monthSortKey,
      incoming: 0n,
      outgoing: 0n,
      count: 0,
    };
    month.count += 1;

    if (destinationMine && !sourceMine) {
      totalIncoming += amount;
      month.incoming += amount;
    }
    if (sourceMine && !destinationMine) {
      totalOutgoing += amount;
      month.outgoing += amount;
    }

    const counterparty = sourceMine ? tx.destination : tx.source;
    if (counterparty && !identitySet.has(counterparty)) {
      const existing = counterparties.get(counterparty) ?? {
        identity: counterparty,
        label: KNOWN_CONTRACT_ADDRESSES[counterparty] ?? counterparty,
        count: 0,
        volume: 0n,
      };
      existing.count += 1;
      existing.volume += amount;
      counterparties.set(counterparty, existing);
    }

    const contractIdentity = tx.destination && KNOWN_CONTRACT_ADDRESSES[tx.destination]
      ? tx.destination
      : tx.source && KNOWN_CONTRACT_ADDRESSES[tx.source]
        ? tx.source
        : null;
    if (contractIdentity) {
      const label = KNOWN_CONTRACT_ADDRESSES[contractIdentity] ?? contractIdentity;
      const existing = contractUsage.get(label) ?? { contract: label, count: 0, volume: 0n };
      existing.count += 1;
      existing.volume += amount;
      contractUsage.set(label, existing);
    }

    monthly.set(monthSortKey, month);
  }

  const avgTxAmount = txCount > 0 ? (totalIncoming + totalOutgoing) / BigInt(txCount) : 0n;

  return {
    netFlow: totalIncoming - totalOutgoing,
    totalIncoming,
    totalOutgoing,
    txCount,
    avgTxAmount,
    biggestCounterparties: [...counterparties.values()]
      .sort((a, b) => (a.volume === b.volume ? b.count - a.count : a.volume > b.volume ? -1 : 1))
      .slice(0, 5),
    contractUsage: [...contractUsage.values()]
      .sort((a, b) => (a.count === b.count ? (a.volume > b.volume ? -1 : 1) : b.count - a.count))
      .slice(0, 5),
    monthlySummaries: [...monthly.values()]
      .sort((a, b) => b.sortKey - a.sortKey)
      .slice(0, 6),
    dailyActivity: [...daily.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-84), // last 12 weeks
  };
}
