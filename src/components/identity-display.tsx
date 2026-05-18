import { useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "motion/react";
import { usePersistedStore } from "@/store/persisted";

export interface IdentityDisplayProps {
  identity: string;
  style?: CSSProperties;
}

function truncate(id: string): string {
  if (id.length <= 20) return id;
  return `${id.slice(0, 10)}...${id.slice(-10)}`;
}

export function IdentityDisplay({ identity, style }: IdentityDisplayProps) {
  const clearSecs = usePersistedStore((s) => s.settings.clipboardClearSeconds);
  const [expanded, setExpanded] = useState(false);
  const [flash, setFlash] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  async function copy() {
    try {
      await invoke("copy_to_clipboard", { text: identity, clearAfterSecs: clearSecs });
    } catch {
      await navigator.clipboard.writeText(identity).catch(() => {});
    }
    setFlash(true);
    setTimeout(() => setFlash(false), 200);

    if (clearSecs > 0) {
      setCountdown(clearSecs);
      const id = setInterval(() => {
        setCountdown((c) => {
          if (c === null || c <= 1) { clearInterval(id); return null; }
          return c - 1;
        });
      }, 1000);
    }
  }

  function toggle() {
    if (!expanded) copy();
    setExpanded((v) => !v);
  }

  return (
    <div style={style}>
      <motion.button
        animate={{ opacity: flash ? 0.6 : 1 }}
        transition={{ duration: 0.1, ease: [0, 0, 0.2, 1] }}
        onClick={toggle}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-mono-lg)",
          color: "var(--color-text-primary)",
          letterSpacing: "0.05em",
          padding: 0,
          textAlign: "left",
          wordBreak: "break-all",
        }}
      >
        {expanded ? identity : truncate(identity)}
      </motion.button>
      {countdown !== null && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-mono-sm)",
            color: "var(--color-text-disabled)",
            marginTop: "var(--space-1)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          [CLIPBOARD CLEARS IN {countdown}s]
        </div>
      )}
    </div>
  );
}
