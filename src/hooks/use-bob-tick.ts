import { useEffect, useRef } from "react";
import { createBobSubscriptionClient } from "@qubic.org/bob";
import { validateBobWsUrl } from "@/lib/bob-client";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";

/**
 * Subscribes to real-time tick updates from a Bob indexer WebSocket.
 * Only active when Bob is enabled, healthy (sync lag within tickOffset), and wsUrl is set.
 */
export function useBobTick(): void {
  const network = usePersistedStore((s) => s.settings.network);
  const tickOffset = usePersistedStore((s) => s.settings.tickOffset);
  const setBobTick = useSessionStore((s) => s.setBobTick);
  const bobSyncLag = useSessionStore((s) => s.bobSyncLag);
  const abortRef = useRef<AbortController | null>(null);

  const bobIsHealthy = bobSyncLag === null || bobSyncLag <= tickOffset;

  useEffect(() => {
    if (!network.useBobNode || !network.bobWsUrl?.trim() || !bobIsHealthy) {
      setBobTick(null, false);
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    let active = true;

    (async () => {
      try {
        const wsUrl = validateBobWsUrl(network.bobWsUrl!.trim());
        const client = createBobSubscriptionClient({ wsUrl, autoReconnect: true });
        for await (const event of client.subscribeNewTicks({ signal: ac.signal })) {
          if (!active) break;
          const d = event.data as unknown as Record<string, unknown>;
          const tick = (d.tickNumber ?? d.tick) as number | undefined;
          setBobTick(tick ?? null, true);
        }
      } catch {
        if (active) setBobTick(null, false);
      }
    })();

    return () => {
      active = false;
      ac.abort();
      abortRef.current = null;
      setBobTick(null, false);
    };
  }, [network.useBobNode, network.bobWsUrl, bobIsHealthy, setBobTick]);
}
