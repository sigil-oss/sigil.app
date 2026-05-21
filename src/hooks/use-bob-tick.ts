import { useEffect, useRef } from "react";
import { createBobSubscriptionClient } from "@qubic.org/bob";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";

/**
 * Subscribes to real-time tick updates from a Bob indexer WebSocket.
 * Writes to session store. Only active when `useBobNode` is enabled and `bobWsUrl` is set.
 */
export function useBobTick(): void {
  const network = usePersistedStore((s) => s.settings.network);
  const setBobTick = useSessionStore((s) => s.setBobTick);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!network.useBobNode || !network.bobWsUrl?.trim()) {
      setBobTick(null, false);
      return;
    }

    const wsUrl = network.bobWsUrl.trim();
    const ac = new AbortController();
    abortRef.current = ac;
    let active = true;

    (async () => {
      try {
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
  }, [network.useBobNode, network.bobWsUrl, setBobTick]);
}
