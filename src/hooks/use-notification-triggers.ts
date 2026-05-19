import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { useBalance } from "@/hooks/use-balance";
import { useTxHistory } from "@/hooks/use-tx-history";
import { useLastProcessedTick } from "@/hooks/use-last-processed-tick";
import { notify } from "@/lib/notifications";

function truncateId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function useNotificationTriggers() {
  const wallets = useSessionStore((s) => s.wallets);
  const activeIndex = usePersistedStore((s) => s.settings.activeAccountIndex);
  const pendingTxs = usePersistedStore((s) => s.pendingTxs);
  const enabled = usePersistedStore((s) => s.settings.notificationsEnabled);
  const onReceived = usePersistedStore((s) => s.settings.notifyOnReceived);
  const onSent = usePersistedStore((s) => s.settings.notifyOnSent);
  const onConfirmed = usePersistedStore((s) => s.settings.notifyOnConfirmed);

  const identity = wallets[activeIndex]?.identity ?? null;
  const queryClient = useQueryClient();

  // ── Received: watch balance for increases ─────────────────────────────
  const { data: balanceData } = useBalance(enabled && onReceived ? identity : null);
  const prevBalanceRef = useRef<bigint | null>(null);

  useEffect(() => {
    prevBalanceRef.current = null;
  }, [identity]);

  useEffect(() => {
    const current = balanceData?.balance ?? null;
    if (current !== null && prevBalanceRef.current !== null && current > prevBalanceRef.current) {
      const diff = current - prevBalanceRef.current;
      notify("QU Received", `+${Number(diff).toLocaleString()} QU${identity ? ` → ${truncateId(identity)}` : ""}`);
    }
    if (current !== null) prevBalanceRef.current = current;
  }, [balanceData?.balance]); // eslint-disable-line react-hooks/exhaustive-deps

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
            notify(tx.contractName, "Transaction broadcast");
          } else {
            notify("QU Sent", `${Number(tx.amount).toLocaleString()} QU → ${truncateId(tx.destination)}`);
          }
        }
      }
    }
    prevPendingHashesRef.current = currentHashes;
  }, [pendingTxs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Confirmed / expired: driven by lastProcessedTick + tx history ─────
  const { data: lastProcessedTickData } = useLastProcessedTick();
  const lastProcessedTick = lastProcessedTickData?.tickNumber ?? 0;
  const { data: txHistory } = useTxHistory(enabled && onConfirmed ? identity : null);
  const confirmedHashesRef = useRef<Set<string>>(new Set());
  const historyInitializedRef = useRef(false);

  // Immediately refresh history when a pending tx's target tick is processed
  useEffect(() => {
    if (!lastProcessedTick || !identity) return;
    const hasReady = pendingTxs.some((p) => lastProcessedTick >= p.targetTick);
    if (hasReady) queryClient.invalidateQueries({ queryKey: ["tx-history", identity] });
  }, [lastProcessedTick, pendingTxs, identity, queryClient]);

  // Confirmed: tx appeared in history
  useEffect(() => {
    if (!txHistory) return;

    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true;
      const historyHashSet = new Set(txHistory.map((t) => t.hash).filter(Boolean) as string[]);
      for (const p of pendingTxs) {
        if (historyHashSet.has(p.hash)) confirmedHashesRef.current.add(p.hash);
      }
      return;
    }

    if (!enabled || !onConfirmed) return;

    const historyMap = new Map<string, (typeof txHistory)[number]>();
    for (const t of txHistory) {
      if (t.hash) historyMap.set(t.hash, t);
    }

    for (const pending of pendingTxs) {
      if (confirmedHashesRef.current.has(pending.hash)) continue;
      const histTx = historyMap.get(pending.hash);
      if (!histTx) continue;
      confirmedHashesRef.current.add(pending.hash);
      const label = pending.contractName ?? `${Number(pending.amount).toLocaleString()} QU`;
      if (histTx.moneyFlew) {
        notify("Confirmed", `${label} — confirmed on chain`);
      } else {
        notify("Transaction Failed", `${label} — money did not fly`);
      }
    }
  }, [txHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expired: tx never appeared in history after target tick + 2 processed ticks
  // (+2 buffer so history has time to arrive before we declare failure)
  useEffect(() => {
    if (!enabled || !onConfirmed || !lastProcessedTick) return;
    for (const pending of pendingTxs) {
      if (confirmedHashesRef.current.has(pending.hash)) continue;
      if (lastProcessedTick >= pending.targetTick + 2) {
        confirmedHashesRef.current.add(pending.hash);
        const label = pending.contractName ?? `${Number(pending.amount).toLocaleString()} QU`;
        notify("Tick Missed", `${label} — target tick expired`);
      }
    }
  }, [lastProcessedTick, pendingTxs]); // eslint-disable-line react-hooks/exhaustive-deps
}
