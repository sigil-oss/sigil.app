import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/layouts/app-shell";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { ScreenHeader } from "@/components/screen-header";
import { usePersistedStore } from "@/store/persisted";
import { createQubicClient, configureRpc, normalizeRpcUrl } from "@/lib/rpc";

function sanitizeRpcUrl(value: string): string | null {
  return normalizeRpcUrl(value.trim());
}

type TestStatus = "idle" | "testing" | "ok" | "error";

const CURRENCIES = ["USD", "EUR", "BTC"] as const;
const TICK_PRESETS = [5, 10, 15, 20, 30, 50] as const;

export default function NetworkScreen() {
  const navigate = useNavigate();

  const settings = usePersistedStore((s) => s.settings);
  const updateSettings = usePersistedStore((s) => s.updateSettings);

  const queryClient = useQueryClient();
  const [liveUrl, setLiveUrl] = useState(settings.network.liveApiUrl);
  const [queryUrl, setQueryUrl] = useState(settings.network.queryApiUrl);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testTick, setTestTick] = useState<number | null>(null);
  const [testError, setTestError] = useState("");

  async function testAndSave() {
    const live = sanitizeRpcUrl(liveUrl);
    const archive = sanitizeRpcUrl(queryUrl);
    if (!live || !archive) {
      setTestStatus("error");
      setTestError("HTTPS RPC URLs are required.");
      return;
    }
    setTestStatus("testing");
    setTestTick(null);
    setTestError("");
    try {
      const client = createQubicClient({ liveBaseUrl: live, archiveBaseUrl: archive });
      const result = await client.live.getTickInfo();
      if (!result.ok) throw new Error("bad response");
      setTestTick(result.value.tick ?? null);
      setTestStatus("ok");
      configureRpc(live, archive);
      updateSettings({
        network: {
          ...settings.network,
          liveApiUrl: live,
          queryApiUrl: archive,
          name:
            live === "https://rpc.qubic.org/live/v1" &&
            archive === "https://rpc.qubic.org/query/v1"
              ? "mainnet"
              : "custom",
        },
      });
      queryClient.invalidateQueries();
    } catch {
      setTestStatus("error");
      setTestError("Endpoint check failed.");
    }
  }

  function resetToDefaults() {
    const defaultLive = "https://rpc.qubic.org/live/v1";
    const defaultQuery = "https://rpc.qubic.org/query/v1";
    setLiveUrl(defaultLive);
    setQueryUrl(defaultQuery);
    setTestStatus("idle");
    configureRpc(defaultLive, defaultQuery);
    updateSettings({ network: { liveApiUrl: defaultLive, queryApiUrl: defaultQuery, name: "mainnet" } });
    queryClient.invalidateQueries();
  }

  const statusBar = <ScreenHeader title="Network" onBack={() => navigate("/settings")} />;

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

      {/* RPC Endpoints */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
            RPC endpoints
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
            Live and archive API base URLs
          </div>
        </div>
        <Input
          label="Live API"
          value={liveUrl}
          onChange={(e) => { setLiveUrl(e.target.value); setTestStatus("idle"); setTestError(""); }}
          placeholder="https://rpc.qubic.org/live/v1"
          style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)" }}
        />
        <Input
          label="Archive API"
          value={queryUrl}
          onChange={(e) => { setQueryUrl(e.target.value); setTestStatus("idle"); setTestError(""); }}
          placeholder="https://rpc.qubic.org/query/v1"
          style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <Button
            variant="secondary"
            shape="sharp"
            size="sm"
            style={{ width: "auto" }}
            onClick={testAndSave}
            loading={testStatus === "testing"}
            disabled={!liveUrl.trim() || !queryUrl.trim()}
          >
            Test &amp; save
          </Button>
          <button
            onClick={resetToDefaults}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0 }}
          >
            RESET
          </button>
          {testStatus === "ok" && testTick !== null && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-success)", letterSpacing: "0.05em" }}>
              [TICK #{testTick}]
            </span>
          )}
          {testStatus === "error" && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
              [UNREACHABLE]
            </span>
          )}
        </div>
        {testError && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-error)", letterSpacing: "0.05em" }}>
            [{testError.toUpperCase()}]
          </div>
        )}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
          [CUSTOM RPCS MUST USE HTTPS]
        </div>
      </div>

      {/* Custom price feed */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
            Custom price feed
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
            Override the default price source. Must return <code>{`{"data":{"price":0.0,...}}`}</code>
          </div>
        </div>
        <Input
          label="Price feed URL (optional)"
          value={settings.customPriceFeedUrl}
          onChange={(e) => updateSettings({ customPriceFeedUrl: e.target.value.trim() })}
          placeholder="https://example.com/v1/latest-stats"
          style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)" }}
        />
        {settings.customPriceFeedUrl && (
          <button
            onClick={() => updateSettings({ customPriceFeedUrl: "" })}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: 0, textAlign: "left" }}
          >
            CLEAR (use default)
          </button>
        )}
      </div>

      {/* Tick offset */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
            Transaction tick offset
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
            Target tick = current tick + offset. Higher = more time to confirm.
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {TICK_PRESETS.map((v) => {
            const isSelected = v === settings.tickOffset;
            return (
              <button
                key={v}
                onClick={() => updateSettings({ tickOffset: v })}
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  background: "none",
                  border: `1px solid ${isSelected ? "var(--color-text-display)" : "var(--color-border-strong)"}`,
                  borderRadius: "var(--radius-sharp)",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-mono-sm)",
                  letterSpacing: "0.05em",
                  color: isSelected ? "var(--color-text-display)" : "var(--color-text-secondary)",
                }}
              >
                +{v}
              </button>
            );
          })}
        </div>
      </div>

      {/* Currency */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
            Display currency
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
            Used for fiat equivalent when price data is available
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {CURRENCIES.map((c) => {
            const isSelected = c === settings.currency;
            return (
              <button
                key={c}
                onClick={() => updateSettings({ currency: c })}
                style={{
                  padding: "var(--space-2) var(--space-4)",
                  background: "none",
                  border: `1px solid ${isSelected ? "var(--color-text-display)" : "var(--color-border-strong)"}`,
                  borderRadius: "var(--radius-sharp)",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-mono-sm)",
                  letterSpacing: "0.05em",
                  color: isSelected ? "var(--color-text-display)" : "var(--color-text-secondary)",
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>
      {/* Debug mode */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <button
          onClick={() => updateSettings({ debugMode: !settings.debugMode })}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            padding: "var(--space-4)",
            background: "none",
            border: `1px solid ${settings.debugMode ? "var(--color-text-display)" : "var(--color-border-strong)"}`,
            borderRadius: "var(--radius-sharp)",
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
              Diagnostic UI
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
              Enable developer-oriented diagnostics and advanced inspection surfaces
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: settings.debugMode ? "var(--color-text-display)" : "var(--color-text-disabled)", letterSpacing: "0.05em", flexShrink: 0 }}>
            {settings.debugMode ? "[ON]" : "[OFF]"}
          </span>
        </button>
        <button
          onClick={() => updateSettings({ allowBlurLockBypass: !settings.allowBlurLockBypass })}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            padding: "var(--space-4)",
            background: "none",
            border: `1px solid ${settings.allowBlurLockBypass ? "var(--color-status-error)" : "var(--color-border-strong)"}`,
            borderRadius: "var(--radius-sharp)",
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
              Blur-lock bypass
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
              Developer-only bypass for lock-on-blur without disabling diagnostics
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: settings.allowBlurLockBypass ? "var(--color-status-error)" : "var(--color-text-disabled)", letterSpacing: "0.05em", flexShrink: 0 }}>
            {settings.allowBlurLockBypass ? "[ON]" : "[OFF]"}
          </span>
        </button>
      </div>

    </AppShell>
  );
}
