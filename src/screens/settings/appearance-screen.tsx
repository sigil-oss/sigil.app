import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { usePersistedStore, type AppSettings, type FontPairId, type AccentColorId } from "@/store/persisted";
import { FONT_PAIRS, ACCENT_COLORS, deriveCustomScheme } from "@/lib/appearance";

type Theme = AppSettings["theme"];

interface ThemeDef {
  id: Theme;
  label: string;
  bg: string;
  surface: string;
  text: string;
  border: string;
  accent: string;
}

const THEMES: ThemeDef[] = [
  { id: "dark",     label: "Nothing",   bg: "#000000", surface: "#181818", text: "#ffffff", border: "#2a2a2a", accent: "#ffffff" },
  { id: "graphite", label: "Graphite",  bg: "#111111", surface: "#242424", text: "#f0f0f0", border: "#333333", accent: "#f0f0f0" },
  { id: "midnight", label: "Midnight",  bg: "#050810", surface: "#111828", text: "#dde8ff", border: "#1a2640", accent: "#7898dd" },
  { id: "light",    label: "Light",     bg: "#f5f3ef", surface: "#e5e1da", text: "#0a0a0a", border: "#c8c4bc", accent: "#0a0a0a" },
  { id: "system",   label: "System",    bg: "#000000", surface: "#181818", text: "#ffffff", border: "#2a2a2a", accent: "#888888" },
];

function ThemeCard({ def, selected, onSelect }: { def: ThemeDef; selected: boolean; onSelect: () => void }) {
  const isSystem = def.id === "system";
  return (
    <button
      onClick={onSelect}
      style={{
        background: "none",
        border: `1px solid ${selected ? "var(--color-text-display)" : "var(--color-border-strong)"}`,
        borderRadius: "var(--radius-card)",
        padding: 0,
        cursor: "pointer",
        overflow: "hidden",
        width: "100%",
        textAlign: "left",
      }}
    >
      <div
        style={{
          background: def.bg,
          height: 72,
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          position: "relative",
          borderBottom: `1px solid ${def.border}`,
        }}
      >
        {isSystem ? (
          <>
            <div style={{ position: "absolute", inset: 0, display: "flex" }}>
              <div style={{ flex: 1, background: "#000000" }} />
              <div style={{ flex: 1, background: "#f5f3ef" }} />
            </div>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#888888", letterSpacing: "0.05em" }}>AUTO</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ width: 20, height: 3, borderRadius: 2, background: def.text, opacity: 0.7 }} />
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
            </div>
            <div style={{ width: 44, height: 5, borderRadius: 2, background: def.text, opacity: 0.9, marginTop: 4 }} />
            <div style={{ width: 20, height: 3, borderRadius: 2, background: def.text, opacity: 0.3 }} />
            <div style={{ width: 28, height: 6, borderRadius: 2, border: `1px solid ${def.border}`, marginTop: "auto" }} />
          </>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-2) var(--space-3)",
          background: "var(--color-bg-surface)",
        }}
      >
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)" }}>
          {def.label}
        </span>
        {selected && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-display)", letterSpacing: "0.05em" }}>
            ✓
          </span>
        )}
      </div>
    </button>
  );
}

function FontCard({ pair, selected, onSelect }: { pair: typeof FONT_PAIRS[0]; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      style={{
        background: selected ? "var(--color-bg-elevated)" : "var(--color-bg-surface)",
        border: `1px solid ${selected ? "var(--color-text-display)" : "var(--color-border-strong)"}`,
        borderRadius: "var(--radius-card)",
        padding: "var(--space-3)",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      <div style={{ fontFamily: pair.sans, fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.2 }}>
        {pair.name}
      </div>
      <div style={{ fontFamily: pair.mono, fontSize: "10px", color: "var(--color-text-secondary)", marginTop: 4, letterSpacing: "0.04em" }}>
        MONO 0123
      </div>
    </button>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
        {title}
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
        {subtitle}
      </div>
    </div>
  );
}

function ColorPreview({ bg, text, accent }: { bg: string; text: string; accent: string }) {
  const v = deriveCustomScheme(bg, text, accent);
  return (
    <div
      style={{
        background: v["--color-bg-base"],
        border: `1px solid ${v["--color-border-strong"]}`,
        borderRadius: "var(--radius-card)",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: v["--color-text-disabled"], letterSpacing: "0.08em" }}>
          [SIGIL]
        </span>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: v["--color-status-success"] }} />
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 500, color: v["--color-text-display"] }}>
        1,234,567 QU
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "11px", color: v["--color-text-secondary"] }}>
        my wallet
      </div>
      <div style={{ height: 1, background: v["--color-border-subtle"], margin: "2px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: v["--color-text-secondary"], letterSpacing: "0.05em" }}>
          SENT
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: v["--color-text-primary"], letterSpacing: "0.05em" }}>
          − 500 QU
        </span>
      </div>
    </div>
  );
}

export default function AppearanceScreen() {
  const navigate = useNavigate();

  const theme = usePersistedStore((s) => s.settings.theme);
  const fontPair = usePersistedStore((s) => s.settings.fontPair);
  const accentColor = usePersistedStore((s) => s.settings.accentColor);
  const customScheme = usePersistedStore((s) => s.settings.customScheme);
  const updateSettings = usePersistedStore((s) => s.updateSettings);

  const [localBg, setLocalBg] = useState(customScheme?.bg ?? "#0a0a0a");
  const [localText, setLocalText] = useState(customScheme?.text ?? "#f0f0f0");

  const accentHex = ACCENT_COLORS.find((a) => a.id === accentColor)?.hex ?? "#22c55e";
  const customEnabled = !!customScheme;

  function handleBgChange(hex: string) {
    setLocalBg(hex);
    if (customEnabled) updateSettings({ customScheme: { bg: hex, text: localText } });
  }

  function handleTextChange(hex: string) {
    setLocalText(hex);
    if (customEnabled) updateSettings({ customScheme: { bg: localBg, text: hex } });
  }

  function toggleCustom() {
    if (customEnabled) {
      updateSettings({ customScheme: null });
    } else {
      updateSettings({ customScheme: { bg: localBg, text: localText } });
    }
  }

  const statusBar = <ScreenHeader title="Appearance" onBack={() => navigate("/settings")} />;

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

      {/* ── Theme ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <SectionHeader title="Theme" subtitle="Base color palette" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
          {THEMES.filter((t) => t.id !== "system").map((def) => (
            <ThemeCard key={def.id} def={def} selected={theme === def.id && !customEnabled} onSelect={() => { updateSettings({ theme: def.id, customScheme: null }); }} />
          ))}
        </div>
        {THEMES.filter((t) => t.id === "system").map((def) => (
          <ThemeCard key={def.id} def={def} selected={theme === def.id && !customEnabled} onSelect={() => { updateSettings({ theme: def.id, customScheme: null }); }} />
        ))}
      </div>

      {/* ── Font ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <SectionHeader title="Font" subtitle="Applies to all text" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
          {FONT_PAIRS.map((pair) => (
            <FontCard
              key={pair.id}
              pair={pair}
              selected={fontPair === pair.id}
              onSelect={() => updateSettings({ fontPair: pair.id as FontPairId })}
            />
          ))}
        </div>
      </div>

      {/* ── Accent ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <SectionHeader title="Accent" subtitle="Balances, confirmations, success states" />
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          {ACCENT_COLORS.map((ac) => (
            <button
              key={ac.id}
              onClick={() => updateSettings({ accentColor: ac.id as AccentColorId })}
              title={ac.name}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: ac.hex,
                border: accentColor === ac.id ? "2px solid var(--color-text-display)" : "2px solid transparent",
                boxShadow: accentColor === ac.id ? `0 0 0 2px ${ac.hex}` : "none",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Custom colors ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionHeader title="Custom colors" subtitle="Override theme with your own bg and text" />
        <button
          onClick={toggleCustom}
          style={{
            background: customEnabled ? "var(--color-status-success)" : "var(--color-bg-elevated)",
            border: `1px solid ${customEnabled ? "var(--color-status-success)" : "var(--color-border-strong)"}`,
            borderRadius: 12,
            padding: "3px 10px",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: customEnabled ? "#000" : "var(--color-text-secondary)",
            letterSpacing: "0.05em",
            flexShrink: 0,
            marginLeft: "var(--space-4)",
          }}
        >
          {customEnabled ? "ON" : "OFF"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          {/* BG picker */}
          <label
            style={{
              flex: 1,
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: "var(--radius-card)",
              padding: "var(--space-3)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
              BACKGROUND
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <div style={{ width: 20, height: 20, borderRadius: 4, background: localBg, border: "1px solid var(--color-border-strong)", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-text-primary)", letterSpacing: "0.04em" }}>
                {localBg}
              </span>
            </div>
            <input
              type="color"
              value={localBg}
              onChange={(e) => handleBgChange(e.target.value)}
              style={{ width: "100%", height: 24, border: "none", background: "none", cursor: "pointer", padding: 0 }}
            />
          </label>

          {/* Text picker */}
          <label
            style={{
              flex: 1,
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: "var(--radius-card)",
              padding: "var(--space-3)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
              TEXT
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <div style={{ width: 20, height: 20, borderRadius: 4, background: localText, border: "1px solid var(--color-border-strong)", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-text-primary)", letterSpacing: "0.04em" }}>
                {localText}
              </span>
            </div>
            <input
              type="color"
              value={localText}
              onChange={(e) => handleTextChange(e.target.value)}
              style={{ width: "100%", height: 24, border: "none", background: "none", cursor: "pointer", padding: 0 }}
            />
          </label>
        </div>

        {/* Live preview */}
        <ColorPreview bg={localBg} text={localText} accent={accentHex} />

        {!customEnabled && (
          <button
            onClick={toggleCustom}
            style={{
              background: "none",
              border: "1px solid var(--color-border-strong)",
              borderRadius: "var(--radius-card)",
              padding: "var(--space-3)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-mono-sm)",
              color: "var(--color-text-secondary)",
              letterSpacing: "0.05em",
              width: "100%",
            }}
          >
            APPLY CUSTOM COLORS
          </button>
        )}
      </div>
      </div>

    </AppShell>
  );
}
