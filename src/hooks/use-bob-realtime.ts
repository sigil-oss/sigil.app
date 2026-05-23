import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createBobSubscriptionClient } from "@qubic.org/bob";
import type { Identity } from "@qubic.org/types";
import { validateBobWsUrl } from "@/lib/bob-client";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { qk } from "@/lib/query-keys";

const INVALIDATE_DEBOUNCE_MS = 2_000;

/**
 * When Bob is enabled and healthy, subscribes to transfer events for the active identity via WebSocket.
 * Live events are coalesced into a short debounce window so a noisy Bob socket
 * cannot trigger unbounded query invalidation storms.
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
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleInvalidate() {
      if (invalidateTimer) return;
      invalidateTimer = setTimeout(() => {
        invalidateTimer = null;
        queryClient.invalidateQueries({ queryKey: qk.balance(identity) });
        queryClient.invalidateQueries({ queryKey: qk.txHistory(identity) });
      }, INVALIDATE_DEBOUNCE_MS);
    }

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
          scheduleInvalidate();
        }
      } catch {
        // non-critical
      }
    })();

    return () => {
      ac.abort();
      if (invalidateTimer) clearTimeout(invalidateTimer);
      client?.close();
    };
  }, [active, identity, wsUrl, queryClient]);
}
