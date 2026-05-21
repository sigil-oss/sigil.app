import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useSessionStore } from "@/store/session";
import { usePersistedStore } from "@/store/persisted";
import { router } from "@/router";
import { notify } from "@/lib/notifications";
import { CONTRACT_NAMES, CONTRACT_PROCEDURE_NAMES } from "@/lib/contracts";
import { truncateIdentity } from "@/lib/crypto";

function buildNotification(req: Record<string, unknown>): { title: string; body: string } | null {
  const dappName = (req.dapp as { name?: string } | undefined)?.name ?? "A dApp";
  switch (req.type) {
    case "transfer": {
      const amount = Number(req.amount).toLocaleString();
      const to = truncateIdentity(String(req.to ?? ""));
      return { title: "Transfer Request", body: `${amount} QU → ${to}` };
    }
    case "sc_call": {
      const idx = req.contract_index as number;
      const contractName = CONTRACT_NAMES[idx] ?? `Contract #${idx}`;
      const procName = CONTRACT_PROCEDURE_NAMES[`${idx}:${req.input_type}`] ?? null;
      const label = procName ? `${contractName} · ${procName}` : contractName;
      const hasAmount = (req.amount as number | undefined ?? 0) > 0;
      return {
        title: label,
        body: hasAmount
          ? `${Number(req.amount).toLocaleString()} QU — from ${dappName}`
          : `From ${dappName}`,
      };
    }
    case "sign_message":
      return { title: "Sign Message", body: `From ${dappName}` };
    case "verify_message":
      return { title: "Verify Message", body: `From ${dappName}` };
    case "connect":
      return { title: "Connect Request", body: `${dappName} wants to connect` };
    default:
      return null;
  }
}

/** Listens for `sigil:request` Tauri events and cold-start pending requests, routing to /request when unlocked. */
export function useDeepLink() {
  const setPendingRequest = useSessionStore((s) => s.setPendingRequest);
  const isLocked = useSessionStore((s) => s.isLocked);
  const notificationsEnabled = usePersistedStore((s) => s.settings.notificationsEnabled);

  // Refs keep the single effect's callbacks up-to-date without re-subscribing.
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const setPendingRequestRef = useRef(setPendingRequest);
  setPendingRequestRef.current = setPendingRequest;
  const notificationsEnabledRef = useRef(notificationsEnabled);
  notificationsEnabledRef.current = notificationsEnabled;

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    function applyPayload(payload: string) {
      try {
        const envelope = JSON.parse(payload) as { request?: Record<string, unknown> };
        if (!envelope.request?.type) return;
        setPendingRequestRef.current(payload);
        invoke("clear_pending_request").catch(() => {});
        if (notificationsEnabledRef.current) {
          const n = buildNotification(envelope.request);
          if (n) notify(n.title, n.body);
        }
        if (!isLockedRef.current) {
          router.navigate("/request");
        }
        // If locked, lock screen reads pendingRequest and navigates to /request after unlock.
      } catch {
        // malformed — Rust should have rejected it already
      }
    }

    listen<string>("sigil:request", (event) => {
      applyPayload(event.payload);
    }).then((fn) => { unlisten = fn; });

    // Cold start: wait for the persisted store to hydrate before reading the Rust-side stored
    // request. Without this, vaults.length = 0 at first render (pre-hydration), which would
    // cause applyPayload to clear the pending request before routing is settled.
    function checkPending() {
      invoke<string | null>("get_pending_request").then((payload) => {
        if (payload) applyPayload(payload);
      });
    }

    if (usePersistedStore.persist.hasHydrated()) {
      checkPending();
    } else {
      const unsub = usePersistedStore.persist.onFinishHydration(() => {
        checkPending();
        unsub();
      });
    }

    return () => { unlisten?.(); };
  }, []); // Stable: registered once; stale-closure handled via refs above.
}
