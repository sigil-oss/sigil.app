import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createBobSubscriptionClient } from "@qubic.org/bob";
import type { Identity } from "@qubic.org/types";
import { validateBobWsUrl } from "@/lib/bob-client";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { qk } from "@/lib/query-keys";

/**
 * When Bob is enabled and healthy, subscribes to transfer events for the active identity via WebSocket.
 * Each live event immediately invalidates balance and tx-history caches, replacing polling latency
 * with push-based invalidation. Falls back to normal polling when Bob is disabled or lagging.
 */
export function useBobRealtime(): void {
  const network = usePersistedStore((s) => s.settings.network);
  const tickOffset = usePersistedStore((s) => s.settings.tickOffset);
  const activeIndex = usePersistedStore((s) => s.settings.activeAccountIndex);
  const wallets = useSessionStore((s) => s.wallets);
  const bobSyncLag = useSessionStore((s) => s.bobSyncLag);
  const queryClient = useQueryClient();

  const identity = wallets[activeIndex]?.identity ?? null;
  const bobIsHealthy = bobSyncLag === null || bobSyncLag <= tickOffset;
  const wsUrl = network.bobWsUrl?.trim();
  const active = !!(network.useBobNode && wsUrl && identity && bobIsHealthy);

  useEffect(() => {
    if (!active || !identity || !wsUrl) return;

    const ac = new AbortController();
    let client: ReturnType<typeof createBobSubscriptionClient> | null = null;

    (async () => {
      try {
        client = createBobSubscriptionClient({
          wsUrl: validateBobWsUrl(wsUrl),
          autoReconnect: true,
        });
        for await (const event of client.subscribeTransfers(
          { identity: identity as Identity },
          { signal: ac.signal },
        )) {
          if (event.isCatchUp) continue;
          queryClient.invalidateQueries({ queryKey: qk.balance(identity) });
          queryClient.invalidateQueries({ queryKey: qk.txHistory(identity) });
        }
      } catch {
        // non-critical
      }
    })();

    return () => {
      ac.abort();
      client?.close();
    };
  }, [active, identity, wsUrl, queryClient]);
}
