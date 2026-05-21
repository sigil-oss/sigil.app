import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/button";
import { DONATION_IDENTITY, type Sponsor } from "@/data/sponsors";
import { useSponsors, useInvalidateSponsors } from "@/hooks/use-sponsors";
import { usePersistedStore } from "@/store/persisted";
import { formatQu } from "@/lib/format";

const GITHUB_URL = "https://github.com/sigil-oss/sigil.app";

const MIN_PX = 36;
const MAX_PX = 88;

function blockSize(amount: number, max: number): number {
  if (max === 0) return MIN_PX;
  return Math.round(MIN_PX + (MAX_PX - MIN_PX) * Math.sqrt(amount / max));
}

// ── Identicon (GitHub / Raycast style, FNV-1a) ───────────────────────────────

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// 5×5 grid, horizontally mirrored — 15 bits from the hash
function buildIdenticon(name: string): boolean[][] {
  const hash = fnv1a(name);
  return Array.from({ length: 5 }, (_, row) =>
    [0, 1, 2, 1, 0].map((col) => ((hash >>> (row * 3 + col)) & 1) === 1)
  );
}

function Identicon({ name, size, invert = false }: { name: string; size: number; invert?: boolean }) {
  const grid = buildIdenticon(name);
  const color = invert ? "var(--color-bg-base)" : "var(--color-text-display)";
  // 10px margin each side → 80px grid → 16px per cell → 13px cell, 3px gap
  const margin = 10, spacing = 16, cell = 13, radius = 2.5;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }} aria-hidden>
      {grid.map((row, ri) =>
        row.map((filled, ci) =>
          filled ? (
            <rect
              key={`${ri}-${ci}`}
              x={margin + ci * spacing}
              y={margin + ri * spacing}
              width={cell}
              height={cell}
              rx={radius}
              fill={color}
            />
          ) : null
        )
      )}
    </svg>
  );
}

// ── Sponsor detail sheet ──────────────────────────────────────────────────────

function SponsorSheet({ sponsor, onClose }: { sponsor: Sponsor; onClose: () => void }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 50 }}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--color-bg-base)",
          borderRadius: "12px 12px 0 0",
          borderTop: "1px solid var(--color-border-strong)",
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "var(--space-4) var(--space-6) var(--space-8)",
          gap: "var(--space-5)",
        }}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 3, background: "var(--color-border-strong)", borderRadius: 2 }} />

        {/* Identicon */}
        <div style={{
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-sharp)",
          padding: "var(--space-5)",
        }}>
          <Identicon name={sponsor.name} size={120} />
        </div>

        {/* Info */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-headline)",
            color: "var(--color-text-display)",
            letterSpacing: "0.1em",
          }}>
            {sponsor.name.toUpperCase()}
          </span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-mono-sm)",
            color: "var(--color-text-secondary)",
            letterSpacing: "0.05em",
          }}>
            {formatQu(sponsor.amount)} QU
          </span>
        </div>

        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "var(--space-2)" }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            [CLOSE]
          </span>
        </button>
      </motion.div>
    </>
  );
}

// ── Sponsor grid ──────────────────────────────────────────────────────────────

function SponsorGrid({ sponsors }: { sponsors: Sponsor[] }) {
  const [selected, setSelected] = useState<Sponsor | null>(null);
  const max = Math.max(...sponsors.map((s) => s.amount), 1);

  if (sponsors.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-4)" }}>
        <div style={{
          width: MIN_PX, height: MIN_PX,
          border: "1px dashed var(--color-border-strong)",
          borderRadius: "var(--radius-sharp)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)" }}>?</span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
          [BE THE FIRST]
        </span>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", justifyContent: "center", alignItems: "flex-end" }}>
        {sponsors.map((sponsor, i) => {
          const size = blockSize(sponsor.amount, max);
          return (
            <motion.button
              key={i}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i * 0.015, 1.5), duration: 0.2, ease: "easeOut" }}
              onClick={() => setSelected(sponsor)}
              aria-label={`Sponsor: ${sponsor.name}`}
              style={{
                width: size, height: size,
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border-strong)",
                borderRadius: "var(--radius-sharp)",
                cursor: "pointer",
                flexShrink: 0,
                padding: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <Identicon name={sponsor.name} size={size} />
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && (
          <SponsorSheet sponsor={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Discord prompt sheet ──────────────────────────────────────────────────────

const DISCORD_HANDLE = "alez.t04";

function DiscordSheet({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(DISCORD_HANDLE).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 50 }}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--color-bg-base)",
          borderRadius: "12px 12px 0 0",
          borderTop: "1px solid var(--color-border-strong)",
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "var(--space-4) var(--space-6) var(--space-8)",
          gap: "var(--space-5)",
        }}
      >
        <div style={{ width: 36, height: 3, background: "var(--color-border-strong)", borderRadius: 2 }} />

        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-headline)",
            color: "var(--color-text-display)",
            letterSpacing: "0.1em",
          }}>
            THANK YOU
          </span>
          <span style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-label)",
            color: "var(--color-text-secondary)",
            maxWidth: 280,
          }}>
            Message me on Discord to show your name instead of your identity in the sponsors list.
          </span>
        </div>

        <button
          onClick={copy}
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-sharp)",
            cursor: "pointer",
            padding: "var(--space-3) var(--space-5)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-display)", letterSpacing: "0.05em" }}>
            @{DISCORD_HANDLE}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: copied ? "var(--color-text-primary)" : "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            {copied ? "[COPIED]" : "[COPY]"}
          </span>
        </button>

        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "var(--space-2)" }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
            [CLOSE]
          </span>
        </button>
      </motion.div>
    </>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SupportScreen() {
  const navigate = useNavigate();

  const { data: sponsors = [] } = useSponsors();
  const invalidateSponsors = useInvalidateSponsors();
  const pendingTxs = usePersistedStore((s) => s.pendingTxs);
  const [showDiscord, setShowDiscord] = useState(false);
  const seenHashesRef = useRef<Set<string>>(new Set(pendingTxs.map((t) => t.hash)));

  useEffect(() => {
    for (const tx of pendingTxs) {
      if (seenHashesRef.current.has(tx.hash)) continue;
      seenHashesRef.current.add(tx.hash);
      if (tx.destination === DONATION_IDENTITY) {
        invalidateSponsors();
        setShowDiscord(true);
      }
    }
  }, [pendingTxs]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusBar = <ScreenHeader title="Support" onBack={() => navigate("/settings")} />;

  return (
    <>
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

      {/* Donation */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-6)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-primary)" }}>
            Support Sigil
          </div>
          <div style={{ marginTop: "var(--space-1)", fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
            Send QU to support the project. Sponsors are featured below.
          </div>
        </div>

        <div style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sharp)", padding: "var(--space-4)" }}>
          <QRCodeSVG
            value={DONATION_IDENTITY}
            size={160}
            bgColor="transparent"
            fgColor="var(--color-text-display)"
            level="M"
            aria-label="Donation QR code"
            role="img"
            style={{ display: "block" }}
          />
        </div>

        <button
          onClick={() => navigator.clipboard.writeText(DONATION_IDENTITY).catch(() => {})}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          aria-label="Copy donation identity"
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
            {DONATION_IDENTITY.slice(0, 10)}...{DONATION_IDENTITY.slice(-10)}
          </span>
        </button>

        <Button onClick={() => navigate(`/send?to=${DONATION_IDENTITY}`)}>
          Send support →
        </Button>
      </div>

      {/* Sponsors */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div style={{ flex: 1, height: 1, background: "var(--color-border-subtle)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
            SPONSORS
          </span>
          <div style={{ flex: 1, height: 1, background: "var(--color-border-subtle)" }} />
        </div>

        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          <SponsorGrid sponsors={sponsors} />
        </div>

        <button
          onClick={() => openUrl(GITHUB_URL).catch(() => {})}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, alignSelf: "center" }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
            ★ STAR ON GITHUB
          </span>
        </button>
      </div>

    </AppShell>
    <AnimatePresence>
      {showDiscord && <DiscordSheet onClose={() => setShowDiscord(false)} />}
    </AnimatePresence>
    </>
  );
}
