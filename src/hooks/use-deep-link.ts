import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useSessionStore } from "@/store/session";
import { usePersistedStore } from "@/store/persisted";
import { router } from "@/router";
import { createNotificationEvent, publishNotificationEvent } from "@/lib/notification-events";
import { recordAuditEvent } from "@/lib/audit-log";
import { buildRequestNotification, parseSigilEnvelope } from "@/lib/request-schema";

/** Listens for `sigil:request` Tauri events and cold-start pending requests, routing to /request when unlocked. */
export function useDeepLink() {
  const enqueuePendingRequest = useSessionStore((s) => s.enqueuePendingRequest);
  const isLocked = useSessionStore((s) => s.isLocked);
  const notificationsEnabled = usePersistedStore((s) => s.settings.notificationsEnabled);

  // Refs keep the single effect's callbacks up-to-date without re-subscribing.
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const enqueuePendingRequestRef = useRef(enqueuePendingRequest);
  enqueuePendingRequestRef.current = enqueuePendingRequest;
  const notificationsEnabledRef = useRef(notificationsEnabled);
  notificationsEnabledRef.current = notificationsEnabled;

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    function applyPayload(payload: string) {
      const parsed = parseSigilEnvelope(payload);
      if (!parsed.envelope) return;
      enqueuePendingRequestRef.current(payload);
      recordAuditEvent({
        kind: "request_received",
        status: "info",
        title: "Request received",
        detail: `${String(parsed.envelope.request.type).replace(/_/g, " ")} from ${parsed.envelope.request.dapp.origin}`,
      });
      if (notificationsEnabledRef.current) {
        const n = buildRequestNotification(parsed.envelope.request);
        if (n) {
          publishNotificationEvent(createNotificationEvent({
            kind: "deep_link",
            title: n.title,
            body: n.body,
          })).catch(() => {});
        }
      }
      if (!isLockedRef.current) {
        router.navigate("/request");
      }
      // If locked, lock screen reads pendingRequests and navigates to /request after unlock.
    }

    listen<string>("sigil:request", (event) => {
      applyPayload(event.payload);
      invoke("clear_pending_request").catch(() => {});
    }).then((fn) => { unlisten = fn; }).catch(() => {});

    // Cold start: wait for the persisted store to hydrate before reading the Rust-side stored
    // request. Without this, vaults.length = 0 at first render (pre-hydration), which would
    // cause applyPayload to clear the pending request before routing is settled.
    async function checkPending() {
      try {
        while (true) {
          const payload = await invoke<string | null>("get_pending_request");
          if (!payload) break;
          // Clear before applyPayload so a failure in applyPayload doesn't re-process
          // the same payload on the next loop iteration.
          await invoke("clear_pending_request");
          applyPayload(payload);
        }
      } catch {
        // non-fatal
      }
    }

    if (usePersistedStore.persist.hasHydrated()) {
      void checkPending();
    } else {
      const unsub = usePersistedStore.persist.onFinishHydration(() => {
        void checkPending();
        unsub();
      });
    }

    return () => { unlisten?.(); };
  }, []); // Stable: registered once; stale-closure handled via refs above.
}
