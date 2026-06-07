import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/button";
import { saveFileDialog } from "@/lib/save-file";
import { formatDate, truncateId } from "@/lib/format";
import { usePersistedStore, type RequestHistoryItem } from "@/store/persisted";

const TYPE_LABEL: Record<RequestHistoryItem["type"], string> = {
  transfer: "Send QU",
  sc_call: "Contract call",
  sign_message: "Sign message",
  verify_message: "Verify signature",
  connect: "Connect",
};

export default function RequestHistoryScreen() {
  const navigate = useNavigate();
  const requestHistory = usePersistedStore((s) => s.requestHistory);
  const clearRequestHistory = usePersistedStore((s) => s.clearRequestHistory);
  const updateRequestHistoryItem = usePersistedStore((s) => s.updateRequestHistoryItem);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function retryCallback(item: RequestHistoryItem) {
    if (!item.callbackUrl || !item.callbackBody) return;
    setRetryingId(item.id);
    updateRequestHistoryItem(item.id, { callbackStatus: "pending", callbackUpdatedAt: Date.now() });
    try {
      await invoke("post_callback", { url: item.callbackUrl, body: item.callbackBody });
      updateRequestHistoryItem(item.id, { callbackStatus: "ok", callbackUpdatedAt: Date.now() });
    } catch {
      updateRequestHistoryItem(item.id, { callbackStatus: "failed", callbackUpdatedAt: Date.now() });
    } finally {
      setRetryingId(null);
    }
  }

  async function saveResult(item: RequestHistoryItem) {
    if (!item.callbackBody) return;
    await saveFileDialog(`sigil-request-result-${item.id}.json`, item.callbackBody);
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? requestHistory.filter(
        (item) =>
          item.dappName.toLowerCase().includes(q) ||
          item.dappOrigin.toLowerCase().includes(q) ||
          TYPE_LABEL[item.type].toLowerCase().includes(q) ||
          item.action.includes(q),
      )
    : requestHistory;

  const statusBar = <ScreenHeader title="Request history" onBack={() => navigate("/settings")} />;

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {requestHistory.length > 0 && (
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by dApp, type..."
            className="sigil-input"
            style={{ flex: 1, background: "var(--color-bg-subtle)", borderRadius: "var(--radius-sharp)", padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-display)" }}
          />
          <Button variant="ghost" shape="sharp" size="sm" style={{ width: "auto", flexShrink: 0 }} onClick={clearRequestHistory}>
            Clear
          </Button>
        </div>
      )}

      {requestHistory.length === 0 && (
        <div style={{ textAlign: "center", padding: "var(--space-12) 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
          [NO REQUEST HISTORY]
        </div>
      )}
      {requestHistory.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "var(--space-12) 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
          [NO RESULTS]
        </div>
      )}

      {filtered.map((item) => {
        const callbackState =
          item.callbackStatus === "none"
            ? "No callback"
            : item.callbackStatus === "ok"
              ? "Delivered"
              : item.callbackStatus === "failed"
                ? "Failed"
                : "Pending";

        return (
          <div key={item.id} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-3)", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sharp)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
                  {TYPE_LABEL[item.type]} · {item.action === "approved" ? "approved" : "rejected"}
                </span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
                  {item.dappName || "Unknown dApp"}
                </span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: item.callbackStatus === "failed" ? "var(--color-status-error)" : item.callbackStatus === "ok" ? "var(--color-status-success)" : "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                {callbackState.toUpperCase()}
              </span>
            </div>

            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              <InfoRow label="Origin" value={item.dappOrigin} />
              <InfoRow label="Account" value={item.accountIdentity ? `${item.accountName || "Account"} · ${truncateId(item.accountIdentity, 10, 10)}` : "—"} />
              <InfoRow label="Result" value={item.resultDetail ? truncateId(item.resultDetail, 14, 14) : "—"} />
              <InfoRow label="When" value={formatDate(item.createdAt) || "—"} />
              {item.callbackUrl && <InfoRow label="Callback" value={item.callbackUrl} />}
            </div>

            {item.callbackBody && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {item.callbackStatus === "failed" && (
                  <Button variant="secondary" shape="sharp" size="sm" loading={retryingId === item.id} onClick={() => retryCallback(item)}>
                    Retry callback
                  </Button>
                )}
                <Button variant="ghost" shape="sharp" size="sm" onClick={() => saveResult(item)}>
                  Save JSON
                </Button>
                <Button variant="ghost" shape="sharp" size="sm" onClick={() => navigator.clipboard.writeText(item.callbackBody ?? "").catch(() => {})}>
                  Copy JSON
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-start" }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-primary)", letterSpacing: "0.05em", textAlign: "right", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}
