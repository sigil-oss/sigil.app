import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/button";
import { useLockCountdown } from "@/hooks/use-lock-countdown";
import { Tag } from "@/components/tag";
import { Divider } from "@/components/divider";
import { RequestHeader } from "@/components/request/request-header";
import { TransferPreview, type ApproveResult, type TransferRequest } from "@/components/request/transfer-preview";
import { ScCallPreview, type ScCallRequest } from "@/components/request/sc-call-preview";
import { SignMessagePreview, type SignMessageApproveResult, type SignMessageRequest } from "@/components/request/sign-message-preview";
import { ConnectPreview, type ConnectApproveResult, type ConnectRequest } from "@/components/request/connect-preview";
import { VerifyMessagePreview, type VerifyMessageResult, type VerifyMessageRequest } from "@/components/request/verify-message-preview";
import { saveFileDialog } from "@/lib/save-file";
import { useSessionStore } from "@/store/session";
import { usePersistedStore } from "@/store/persisted";
import { ScreenHeader } from "@/components/screen-header";
import { recordAuditEvent } from "@/lib/audit-log";

type DappMeta = { name: string; origin: string; icon?: string };
type BaseRequest = { dapp: DappMeta; nonce: string; exp?: number };

type SigilRequest =
  | (TransferRequest & { type: "transfer" } & BaseRequest)
  | (ScCallRequest & { type: "sc_call" } & BaseRequest)
  | (SignMessageRequest & { type: "sign_message" } & BaseRequest)
  | (VerifyMessageRequest & { type: "verify_message" } & BaseRequest)
  | (ConnectRequest & { type: "connect" } & BaseRequest);

interface SigilEnvelope {
  request: SigilRequest;
  callback: string | null;
}

type ParseResult = { envelope: SigilEnvelope; error: null } | { envelope: null; error: string };

function isAllowedCallbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    return url.protocol === "https:" || (url.protocol === "http:" && isLocal);
  } catch {
    return false;
  }
}

function parseEnvelope(raw: string | null): ParseResult {
  if (!raw) return { envelope: null, error: "No pending request" };
  try {
    const env = JSON.parse(raw) as { request: Record<string, unknown>; callback: unknown };
    if (!env.request?.type) return { envelope: null, error: "Missing request type" };
    if (typeof (env.request.dapp as { origin?: unknown })?.origin !== "string")
      return { envelope: null, error: "Missing dApp origin" };
    const origin = (env.request.dapp as { origin: string }).origin;
    if (!origin.startsWith("https://")) return { envelope: null, error: "dApp origin must be HTTPS" };
    if (typeof env.callback === "string" && !isAllowedCallbackUrl(env.callback))
      return { envelope: null, error: "Callback URL must use HTTPS or localhost HTTP" };
    if (env.request.exp && Date.now() / 1000 > (env.request.exp as number))
      return { envelope: null, error: "Request expired" };
    return { envelope: env as unknown as SigilEnvelope, error: null };
  } catch {
    return { envelope: null, error: "Invalid request format" };
  }
}

const TYPE_LABEL: Record<string, string> = {
  transfer: "Send QU",
  sc_call: "Contract call",
  sign_message: "Sign message",
  verify_message: "Verify signature",
  connect: "Connect",
};

type CallbackStatus = "pending" | "ok" | "failed";

interface SuccessState {
  kind: "tx" | "message" | "verify" | "connect";
  detail: string; // tx hash, base64 signature, "VALID"/"INVALID", or identity
  hasCallback: boolean;
  callbackStatus: CallbackStatus;
  callbackBody: string;
  callbackUrl: string | null;
  requestHistoryId: string | null;
}

function makeRequestHistoryId() {
  return `req_${crypto.randomUUID()}`;
}

function getAccountNameForIdentity(historyVaults: ReturnType<typeof usePersistedStore.getState>["vaults"], identity: string) {
  for (const vault of historyVaults) {
    const account = vault.accounts.find((candidate) => candidate.identity === identity);
    if (account) return account.name;
  }
  return undefined;
}

export default function RequestScreen() {
  const navigate = useNavigate();

  const pendingRequest = useSessionStore((s) => s.pendingRequests[0] ?? null);
  const pendingRequestCount = useSessionStore((s) => s.pendingRequests.length);
  const shiftPendingRequest = useSessionStore((s) => s.shiftPendingRequest);
  const vaults = usePersistedStore((s) => s.vaults);
  const addRequestHistoryItem = usePersistedStore((s) => s.addRequestHistoryItem);
  const updateRequestHistoryItem = usePersistedStore((s) => s.updateRequestHistoryItem);

  const parseResult = parseEnvelope(pendingRequest);
  const envelope = parseResult.envelope;
  const parseError = parseResult.error;
  const [success, setSuccess] = useState<SuccessState | null>(null);

  useEffect(() => {
    if (!pendingRequest && !success) navigate("/dashboard", { replace: true });
  }, [pendingRequest, success, navigate]);

  // Auto-dismiss when the request's exp timestamp passes so the approval
  // buttons don't remain active after expiry.
  useEffect(() => {
    if (!envelope?.request.exp || success) return;
    const msUntilExp = envelope.request.exp * 1000 - Date.now();
    if (msUntilExp <= 0) {
      shiftPendingRequest();
      return;
    }
    const t = setTimeout(() => {
      shiftPendingRequest();
    }, msUntilExp);
    return () => clearTimeout(t);
  }, [envelope?.request.exp, success, shiftPendingRequest]);

  // Dismiss without notifying the dApp — used by the BACK button so navigating
  // away doesn't send a spurious rejection to the dApp.
  function dismiss() {
    shiftPendingRequest();
  }

  function reject() {
    if (envelope) {
      const requestHistoryId = makeRequestHistoryId();
      const body = JSON.stringify({
        status: "rejected",
        nonce: envelope.request.nonce,
        type: envelope.request.type,
        reason: "user_rejected",
      });
      addRequestHistoryItem({
        id: requestHistoryId,
        createdAt: Date.now(),
        type: envelope.request.type,
        dappName: envelope.request.dapp.name || "Unknown dApp",
        dappOrigin: envelope.request.dapp.origin,
        action: "rejected",
        callbackStatus: envelope.callback ? "pending" : "none",
        callbackUrl: envelope.callback,
        callbackBody: body,
        callbackUpdatedAt: envelope.callback ? Date.now() : null,
      });
      recordAuditEvent({
        kind: "request_rejected",
        status: "info",
        title: "Request rejected",
        detail: `${envelope.request.type} from ${envelope.request.dapp.origin}`,
      });
      if (envelope.callback) {
        const callbackUrl = envelope.callback;
        invoke("post_callback", { url: callbackUrl, body })
          .then(() => {
            updateRequestHistoryItem(requestHistoryId, {
              callbackStatus: "ok",
              callbackUpdatedAt: Date.now(),
            });
          })
          .catch(() => {
            updateRequestHistoryItem(requestHistoryId, {
              callbackStatus: "failed",
              callbackUpdatedAt: Date.now(),
            });
            recordAuditEvent({
              kind: "request_callback_failed",
              status: "failure",
              title: "Callback failed",
              detail: callbackUrl,
            });
          });
      }
    }
    shiftPendingRequest();
  }

  async function postCallback(callbackBody: string, callbackUrl: string | null, requestHistoryId: string | null) {
    if (callbackUrl) {
      try {
        await invoke("post_callback", { url: callbackUrl, body: callbackBody });
        if (requestHistoryId) {
          updateRequestHistoryItem(requestHistoryId, {
            callbackStatus: "ok",
            callbackUpdatedAt: Date.now(),
          });
        }
        setSuccess((s) => s ? { ...s, callbackStatus: "ok" } : s);
      } catch {
        if (requestHistoryId) {
          updateRequestHistoryItem(requestHistoryId, {
            callbackStatus: "failed",
            callbackUpdatedAt: Date.now(),
          });
        }
        recordAuditEvent({
          kind: "request_callback_failed",
          status: "failure",
          title: "Callback failed",
          detail: callbackUrl,
        });
        setSuccess((s) => s ? { ...s, callbackStatus: "failed" } : s);
      }
    } else {
      setSuccess((s) => s ? { ...s, callbackStatus: "ok" } : s);
    }
  }

  async function handleApprove({ txHash, targetTick, identity }: ApproveResult) {
    if (!envelope) return;
    const requestHistoryId = makeRequestHistoryId();
    const callbackUrl = envelope.callback;

    const callbackBody = JSON.stringify({
      status: "signed",
      nonce: envelope.request.nonce,
      type: envelope.request.type,
      identity,
      tx_hash: txHash,
      target_tick: targetTick,
    });

    shiftPendingRequest();
    recordAuditEvent({
      kind: "request_approved",
      status: "success",
      title: "Request approved",
      detail: `${envelope.request.type} from ${envelope.request.dapp.origin}`,
    });
    addRequestHistoryItem({
      id: requestHistoryId,
      createdAt: Date.now(),
      type: envelope.request.type,
      dappName: envelope.request.dapp.name || "Unknown dApp",
      dappOrigin: envelope.request.dapp.origin,
      action: "approved",
      accountIdentity: identity,
      accountName: getAccountNameForIdentity(vaults, identity),
      resultKind: "tx",
      resultDetail: txHash,
      callbackStatus: callbackUrl ? "pending" : "none",
      callbackUrl,
      callbackBody,
      callbackUpdatedAt: callbackUrl ? Date.now() : null,
    });
    const state: SuccessState = {
      kind: "tx",
      detail: txHash,
      hasCallback: !!callbackUrl,
      callbackStatus: "pending",
      callbackBody,
      callbackUrl,
      requestHistoryId,
    };
    setSuccess(state);
    await postCallback(callbackBody, callbackUrl, requestHistoryId);
  }

  async function handleApproveMessage({ signature, publicKey, identity }: SignMessageApproveResult) {
    if (!envelope) return;
    const requestHistoryId = makeRequestHistoryId();
    const callbackUrl = envelope.callback;

    const callbackBody = JSON.stringify({
      status: "signed",
      nonce: envelope.request.nonce,
      type: envelope.request.type,
      identity,
      signature,
      public_key: publicKey,
    });

    shiftPendingRequest();
    recordAuditEvent({
      kind: "request_approved",
      status: "success",
      title: "Message signed",
      detail: envelope.request.dapp.origin,
    });
    addRequestHistoryItem({
      id: requestHistoryId,
      createdAt: Date.now(),
      type: envelope.request.type,
      dappName: envelope.request.dapp.name || "Unknown dApp",
      dappOrigin: envelope.request.dapp.origin,
      action: "approved",
      accountIdentity: identity,
      accountName: getAccountNameForIdentity(vaults, identity),
      resultKind: "message",
      resultDetail: signature,
      callbackStatus: callbackUrl ? "pending" : "none",
      callbackUrl,
      callbackBody,
      callbackUpdatedAt: callbackUrl ? Date.now() : null,
    });
    const state: SuccessState = {
      kind: "message",
      detail: signature,
      hasCallback: !!callbackUrl,
      callbackStatus: "pending",
      callbackBody,
      callbackUrl,
      requestHistoryId,
    };
    setSuccess(state);
    await postCallback(callbackBody, callbackUrl, requestHistoryId);
  }

  async function handleApproveVerify({ valid, identity }: VerifyMessageResult) {
    if (!envelope) return;
    const requestHistoryId = makeRequestHistoryId();
    const callbackUrl = envelope.callback;

    const callbackBody = JSON.stringify({
      status: "verified",
      nonce: envelope.request.nonce,
      type: envelope.request.type,
      valid,
      identity,
    });

    shiftPendingRequest();
    recordAuditEvent({
      kind: "request_approved",
      status: "success",
      title: "Signature verified",
      detail: envelope.request.dapp.origin,
    });
    addRequestHistoryItem({
      id: requestHistoryId,
      createdAt: Date.now(),
      type: envelope.request.type,
      dappName: envelope.request.dapp.name || "Unknown dApp",
      dappOrigin: envelope.request.dapp.origin,
      action: "approved",
      accountIdentity: identity,
      accountName: getAccountNameForIdentity(vaults, identity),
      resultKind: "verify",
      resultDetail: valid ? "VALID" : "INVALID",
      callbackStatus: callbackUrl ? "pending" : "none",
      callbackUrl,
      callbackBody,
      callbackUpdatedAt: callbackUrl ? Date.now() : null,
    });
    const state: SuccessState = {
      kind: "verify",
      detail: valid ? "VALID" : "INVALID",
      hasCallback: !!callbackUrl,
      callbackStatus: "pending",
      callbackBody,
      callbackUrl,
      requestHistoryId,
    };
    setSuccess(state);
    await postCallback(callbackBody, callbackUrl, requestHistoryId);
  }

  async function handleApproveConnect({ identity, permissions }: ConnectApproveResult) {
    if (!envelope) return;
    const requestHistoryId = makeRequestHistoryId();
    const callbackUrl = envelope.callback;

    const callbackBody = JSON.stringify({
      status: "connected",
      nonce: envelope.request.nonce,
      type: envelope.request.type,
      identity,
      permissions,
    });

    shiftPendingRequest();
    recordAuditEvent({
      kind: "request_approved",
      status: "success",
      title: "Connection approved",
      detail: envelope.request.dapp.origin,
    });
    addRequestHistoryItem({
      id: requestHistoryId,
      createdAt: Date.now(),
      type: envelope.request.type,
      dappName: envelope.request.dapp.name || "Unknown dApp",
      dappOrigin: envelope.request.dapp.origin,
      action: "approved",
      accountIdentity: identity,
      accountName: getAccountNameForIdentity(vaults, identity),
      resultKind: "connect",
      resultDetail: identity,
      callbackStatus: callbackUrl ? "pending" : "none",
      callbackUrl,
      callbackBody,
      callbackUpdatedAt: callbackUrl ? Date.now() : null,
    });
    const state: SuccessState = {
      kind: "connect",
      detail: identity,
      hasCallback: !!callbackUrl,
      callbackStatus: "pending",
      callbackBody,
      callbackUrl,
      requestHistoryId,
    };
    setSuccess(state);
    await postCallback(callbackBody, callbackUrl, requestHistoryId);
  }

  async function retryCallbackFromSuccess() {
    if (!success?.callbackUrl) return;
    setSuccess((current) => current ? { ...current, callbackStatus: "pending" } : current);
    await postCallback(success.callbackBody, success.callbackUrl, success.requestHistoryId);
  }

  async function saveResult(successState: SuccessState) {
    await saveFileDialog(`sigil-request-result-${Date.now()}.json`, successState.callbackBody);
  }

  // ── Success screen ──
  if (success) {
    const detailLabel = success.kind === "tx" ? "Transaction hash" : success.kind === "message" ? "Signature" : success.kind === "verify" ? "Result" : "Identity";
    const tagLabel = success.kind === "tx" ? "SENT" : success.kind === "message" ? "SIGNED" : success.kind === "verify" ? (success.detail === "VALID" ? "VALID" : "INVALID") : "CONNECTED";

    return (
      <SheetLayout
        statusBar={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Request Complete
            </span>
          </div>
        }
      >
        <div style={{ textAlign: "center" }}>
          <Tag variant={success.kind === "verify" && success.detail !== "VALID" ? "error" : "success"}>{tagLabel}</Tag>
        </div>

        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
            {detailLabel}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em", wordBreak: "break-all" }}>
            {success.detail}
          </div>
        </div>

        <div>
          {!success.hasCallback ? (
            <Button
              variant="secondary"
              shape="sharp"
              size="sm"
              style={{ width: "auto" }}
              onClick={() => navigator.clipboard.writeText(success.callbackBody).catch(() => {})}
            >
              Copy result
            </Button>
          ) : success.callbackStatus === "pending" ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
              [SENDING CALLBACK...]
            </div>
          ) : success.callbackStatus === "ok" ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-success)", letterSpacing: "0.05em" }}>
              [CALLBACK DELIVERED]
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
                [CALLBACK FAILED]
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                <Button variant="secondary" shape="sharp" size="sm" style={{ width: "auto" }} onClick={retryCallbackFromSuccess}>
                  Retry callback
                </Button>
                <Button variant="ghost" shape="sharp" size="sm" style={{ width: "auto" }} onClick={() => saveResult(success)}>
                  Save JSON
                </Button>
                <Button variant="ghost" shape="sharp" size="sm" style={{ width: "auto" }} onClick={() => navigator.clipboard.writeText(success.callbackBody).catch(() => {})}>
                  Copy JSON
                </Button>
              </div>
            </div>
          )}
        </div>

        <Button onClick={() => navigate("/dashboard")}>Return to app</Button>
      </SheetLayout>
    );
  }

  if (!envelope) {
    return (
      <SheetLayout statusBar={<ScreenHeader title="Request" onBack={() => navigate("/dashboard")} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Tag variant="error">INVALID REQUEST</Tag>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
            [{parseError}]
          </div>
          <Button variant="secondary" shape="sharp" onClick={() => { shiftPendingRequest(); navigate("/dashboard"); }}>Back to app</Button>
        </div>
      </SheetLayout>
    );
  }

  const { request } = envelope;
  const typeLabel = TYPE_LABEL[request.type] ?? request.type;

  const statusBar = <ScreenHeader title={typeLabel} onBack={dismiss} backAriaLabel="Close without rejecting" />;

  return (
    <SheetLayout statusBar={statusBar}>
      <RequestHeader dapp={request.dapp} />
      {pendingRequestCount > 1 && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em" }}>
          [{pendingRequestCount - 1} MORE REQUEST{pendingRequestCount > 2 ? "S" : ""} QUEUED]
        </div>
      )}
      <Divider />

      {request.type === "transfer" ? (
        <TransferPreview
          request={request}
          onApprove={handleApprove}
          onReject={reject}
        />
      ) : request.type === "sc_call" ? (
        <ScCallPreview
          request={request}
          onApprove={handleApprove}
          onReject={reject}
        />
      ) : request.type === "sign_message" ? (
        <SignMessagePreview
          request={request}
          onApprove={handleApproveMessage}
          onReject={reject}
        />
      ) : request.type === "verify_message" ? (
        <VerifyMessagePreview
          request={request}
          onApprove={handleApproveVerify}
          onReject={reject}
        />
      ) : request.type === "connect" ? (
        <ConnectPreview
          request={request}
          onApprove={handleApproveConnect}
          onReject={reject}
        />
      ) : null}
    </SheetLayout>
  );
}

function SheetLayout({ statusBar, children }: { statusBar: ReactNode; children: ReactNode }) {
  const countdown = useLockCountdown();
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Black spacer — window bg shows through, acts as backdrop */}
      <div style={{ height: 32, flexShrink: 0 }} />

      {/* Sheet panel */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "var(--color-bg-base)",
          borderRadius: "12px 12px 0 0",
          borderTop: "1px solid var(--color-border-strong)",
          overflow: "hidden",
        }}
      >
        {/* Handle bar */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0", flexShrink: 0 }}>
          <div style={{ width: 36, height: 3, background: "var(--color-border-strong)", borderRadius: 2 }} />
        </div>

        {/* Status bar */}
        <header
          style={{
            flexShrink: 0,
            height: 44,
            display: "flex",
            alignItems: "center",
            padding: "0 var(--space-4)",
            borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          {statusBar}
        </header>

        {/* Lock countdown */}
        {countdown !== null && (
          <div
            aria-live="polite"
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "var(--space-1) var(--space-4)",
              background: "var(--color-bg-elevated)",
              borderBottom: "1px solid var(--color-border-subtle)",
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em" }}>
              [LOCKING IN {countdown}s]
            </span>
          </div>
        )}

        {/* Content */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "var(--space-6)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
