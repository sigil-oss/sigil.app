import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useVaultBalances } from "@/hooks/use-vault-balances";
import { useTxHistory } from "@/hooks/use-tx-history";
import { useLastProcessedTick } from "@/hooks/use-last-processed-tick";
import { useTickInfo } from "@/hooks/use-tick-info";
import { useLatestStats } from "@/hooks/use-latest-stats";
import { createNotificationEvent, publishNotificationEvent } from "@/lib/notification-events";
import { truncateId, formatQu } from "@/lib/format";
import { qk } from "@/lib/query-keys";

/** Fires desktop notifications on balance increases, tx broadcast, confirmation, and expiry. Also removes resolved pending txs. */
export function useNotificationTriggers() {
  const wallets = useSessionStore((s) => s.wallets);
  const addTxAlert = useSessionStore((s) => s.addTxAlert);
  const activeIndex = usePersistedStore((s) => s.settings.activeAccountIndex);
  const pendingTxs = usePersistedStore((s) => s.pendingTxs);
  const removePendingTx = usePersistedStore((s) => s.removePendingTx);
  const enabled = usePersistedStore((s) => s.settings.notificationsEnabled);
  const onReceived = usePersistedStore((s) => s.settings.notifyOnReceived);
  const onSent = usePersistedStore((s) => s.settings.notifyOnSent);
  const onConfirmed = usePersistedStore((s) => s.settings.notifyOnConfirmed);
  const onMissedConfirmations = usePersistedStore((s) => s.settings.notifyOnMissedConfirmations);
  const onLargeIncoming = usePersistedStore((s) => s.settings.notifyOnLargeIncoming);
  const largeIncomingThreshold = usePersistedStore((s) => s.settings.largeIncomingThreshold);
  const onPriceAlerts = usePersistedStore((s) => s.settings.notifyOnPriceAlerts);
  const priceAlertAbove = usePersistedStore((s) => s.settings.priceAlertAbove);
  const priceAlertBelow = usePersistedStore((s) => s.settings.priceAlertBelow);

  const identity = wallets[activeIndex]?.identity ?? null;
  const queryClient = useQueryClient();
  const pendingTxsRef = useRef(pendingTxs);
  pendingTxsRef.current = pendingTxs;
  const largeIncomingThresholdValue = (() => {
    try {
      return largeIncomingThreshold ? BigInt(largeIncomingThreshold) : null;
    } catch {
      return null;
    }
  })();
  const priceAlertAboveValue = priceAlertAbove ? Number(priceAlertAbove) : NaN;
  const priceAlertBelowValue = priceAlertBelow ? Number(priceAlertBelow) : NaN;

  // ── Received: watch all vault balances for increases ──────────────────
  const { data: allBalances } = useVaultBalances();
  const prevBalancesRef = useRef<Record<string, bigint>>({});

  useEffect(() => {
    if (!allBalances) return;
    const changedIds = new Set<string>();
    for (const [id, current] of Object.entries(allBalances)) {
      const prev = prevBalancesRef.current[id];
      if (prev !== undefined) {
        if (current !== prev) changedIds.add(id);
        if (enabled && onReceived && current > prev) {
          const diff = current - prev;
          publishNotificationEvent(createNotificationEvent({
            kind: "received",
            title: "Incoming QU",
            body: `Received ${diff.toLocaleString()} QU on ${truncateId(id, 8, 4)}.`,
            identity: id,
          })).catch(() => {});
          if (onLargeIncoming && largeIncomingThresholdValue !== null && diff >= largeIncomingThresholdValue) {
            publishNotificationEvent(createNotificationEvent({
              kind: "received",
              title: "Large Incoming QU",
              body: `${diff.toLocaleString()} QU landed on ${truncateId(id, 8, 4)}.`,
              identity: id,
            })).catch(() => {});
          }
        }
      }
    }

    if (changedIds.size > 0 && pendingTxsRef.current.length > 0) {
      const affected = new Set<string>();
      for (const pending of pendingTxsRef.current) {
        if (changedIds.has(pending.source)) affected.add(pending.source);
        if (changedIds.has(pending.destination)) affected.add(pending.destination);
      }
      for (const affectedIdentity of affected) {
        queryClient.invalidateQueries({ queryKey: qk.txHistory(affectedIdentity) });
      }
    }

    prevBalancesRef.current = { ...allBalances };
  }, [allBalances, enabled, onReceived, onLargeIncoming, largeIncomingThresholdValue, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sent: watch pendingTxs for additions ──────────────────────────────
  const prevPendingHashesRef = useRef<Set<string>>(
    new Set(pendingTxs.map((t) => t.hash)),
  );

  useEffect(() => {
    const currentHashes = new Set(pendingTxs.map((t) => t.hash));
    if (enabled && onSent) {
      for (const tx of pendingTxs) {
        if (!prevPendingHashesRef.current.has(tx.hash)) {
          if (tx.contractName) {
            publishNotificationEvent(createNotificationEvent({
              kind: "sent",
              title: "Contract Transaction Sent",
              body: `${tx.contractName} was broadcast and is awaiting confirmation.`,
              identity: tx.source,
              txHash: tx.hash,
              dedupeKey: `sent:${tx.hash}`,
            })).catch(() => {});
          } else {
            publishNotificationEvent(createNotificationEvent({
              kind: "sent",
              title: "Transaction Sent",
              body: `Sent ${BigInt(tx.amount).toLocaleString()} QU to ${truncateId(tx.destination, 8, 4)}. Awaiting confirmation.`,
              identity: tx.source,
              txHash: tx.hash,
              dedupeKey: `sent:${tx.hash}`,
            })).catch(() => {});
          }
        }
      }
    }
    prevPendingHashesRef.current = currentHashes;
  }, [pendingTxs, enabled, onSent]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Confirmed / expired: driven by tick + tx history ─────────────────
  const { data: lastProcessedTickData } = useLastProcessedTick();
  const lastProcessedTick = lastProcessedTickData?.tickNumber ?? 0;
  const { data: tickInfo } = useTickInfo();
  const currentTick = tickInfo?.tick ?? 0;
  // Always fetch history when there are pending txs — cleanup must run regardless of notification prefs.
  const { data: txHistoryData } = useTxHistory(pendingTxs.length > 0 ? identity : null);
  const txHistory = txHistoryData?.pages.flat();
  const confirmedHashesRef = useRef<Set<string>>(new Set());
  const historyInitializedRef = useRef(false);

  // Reset history tracking when the active account changes so we don't fire
  // false "Confirmed" notifications for the new account's existing history.
  useEffect(() => {
    historyInitializedRef.current = false;
    confirmedHashesRef.current = new Set();
  }, [identity]);

  // Immediately refresh history when a pending tx's target tick is processed
  useEffect(() => {
    if (!lastProcessedTick || !identity) return;
    const hasReady = pendingTxs.some((p) => lastProcessedTick >= p.targetTick);
    if (hasReady) queryClient.invalidateQueries({ queryKey: qk.txHistory(identity) });
  }, [lastProcessedTick, pendingTxs, identity, queryClient]);

  // Confirmed: tx appeared in history — always remove; notify if enabled.
  useEffect(() => {
    if (!txHistory) return;

    const historyHashSet = new Set(txHistory.map((t) => t.hash).filter(Boolean) as string[]);

    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true;
      // On first load, silently remove pending txs already in history (no notification).
      for (const p of pendingTxs) {
        if (historyHashSet.has(p.hash)) {
          confirmedHashesRef.current.add(p.hash);
          removePendingTx(p.hash);
        }
      }
      return;
    }

    const historyMap = new Map<string, (typeof txHistory)[number]>();
    for (const t of txHistory) {
      if (t.hash) historyMap.set(t.hash, t);
    }

    for (const pending of pendingTxs) {
      if (confirmedHashesRef.current.has(pending.hash)) continue;
      const histTx = historyMap.get(pending.hash);
      if (!histTx) continue;
      confirmedHashesRef.current.add(pending.hash);
      removePendingTx(pending.hash);
      const label = pending.contractName ?? `${formatQu(pending.amount)} QU`;
      if (histTx.moneyFlew) {
        if (enabled && onConfirmed) {
          publishNotificationEvent(createNotificationEvent({
            kind: "confirmed",
            title: "Transaction Confirmed",
            body: `${label} was confirmed on chain.`,
            identity: pending.source,
            txHash: pending.hash,
            dedupeKey: `resolved:${pending.hash}:confirmed`,
          })).catch(() => {});
        }
      } else {
        addTxAlert({ id: pending.hash, label, reason: "failed" });
        if (enabled && onMissedConfirmations) {
          publishNotificationEvent(createNotificationEvent({
            kind: "failed",
            title: "Transaction Failed",
            body: `${label} reached the chain, but the transfer did not complete successfully.`,
            identity: pending.source,
            txHash: pending.hash,
            dedupeKey: `resolved:${pending.hash}:failed`,
          })).catch(() => {});
        }
      }
    }
  }, [txHistory, enabled, onConfirmed, onMissedConfirmations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expired: tx never appeared in history after target tick + 30 live ticks — always remove; notify if enabled.
  // Uses the live tick (same source as targetTick) so this fires reliably even if the archive lags.
  useEffect(() => {
    if (!currentTick) return;
    for (const pending of pendingTxs) {
      if (confirmedHashesRef.current.has(pending.hash)) continue;
      if (currentTick > pending.targetTick + 30) {
        confirmedHashesRef.current.add(pending.hash);
        removePendingTx(pending.hash);
        const label = pending.contractName ?? `${formatQu(pending.amount)} QU`;
        addTxAlert({ id: pending.hash, label, reason: "expired" });
        if (enabled && onMissedConfirmations) {
          publishNotificationEvent(createNotificationEvent({
            kind: "expired",
            title: "Transaction Expired",
            body: `${label} missed its target tick and was removed from pending.`,
            identity: pending.source,
            txHash: pending.hash,
            dedupeKey: `resolved:${pending.hash}:expired`,
          })).catch(() => {});
        }
      }
    }
  }, [currentTick, pendingTxs, enabled, onMissedConfirmations]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: latestStats } = useLatestStats();
  const previousPriceRef = useRef<number | null>(null);
  const aboveTriggeredRef = useRef(false);
  const belowTriggeredRef = useRef(false);

  useEffect(() => {
    const price = latestStats?.price ?? null;
    if (!enabled || !onPriceAlerts || price === null || !Number.isFinite(price)) return;
    if (previousPriceRef.current === null) {
      previousPriceRef.current = price;
      aboveTriggeredRef.current = Number.isFinite(priceAlertAboveValue) && price >= priceAlertAboveValue;
      belowTriggeredRef.current = Number.isFinite(priceAlertBelowValue) && price <= priceAlertBelowValue;
      return;
    }

    if (Number.isFinite(priceAlertAboveValue)) {
      if (!aboveTriggeredRef.current && previousPriceRef.current < priceAlertAboveValue && price >= priceAlertAboveValue) {
        aboveTriggeredRef.current = true;
        publishNotificationEvent(createNotificationEvent({
          kind: "price_alert",
          title: "QU Price Alert",
          body: `QU moved above $${priceAlertAboveValue.toFixed(4)} and is now trading near $${price.toFixed(4)}.`,
          dedupeKey: `price:above:${priceAlertAboveValue}:${Math.floor(Date.now() / 60_000)}`,
        })).catch(() => {});
      }
      if (price < priceAlertAboveValue) aboveTriggeredRef.current = false;
    }

    if (Number.isFinite(priceAlertBelowValue)) {
      if (!belowTriggeredRef.current && previousPriceRef.current > priceAlertBelowValue && price <= priceAlertBelowValue) {
        belowTriggeredRef.current = true;
        publishNotificationEvent(createNotificationEvent({
          kind: "price_alert",
          title: "QU Price Alert",
          body: `QU moved below $${priceAlertBelowValue.toFixed(4)} and is now trading near $${price.toFixed(4)}.`,
          dedupeKey: `price:below:${priceAlertBelowValue}:${Math.floor(Date.now() / 60_000)}`,
        })).catch(() => {});
      }
      if (price > priceAlertBelowValue) belowTriggeredRef.current = false;
    }

    previousPriceRef.current = price;
  }, [enabled, latestStats?.price, onPriceAlerts, priceAlertAboveValue, priceAlertBelowValue]);
}
