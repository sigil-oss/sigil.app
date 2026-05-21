import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";

const FACTS = [
  "Qubic is founded by Sergey Ivancheglo — the original creator of NXT and co-founder of IOTA.",
  "Qubic's Useful Proof-of-Work trains AI models instead of solving arbitrary puzzles.",
  "CertiK-verified: Qubic peaks at 15.5 million transactions per second — one of the fastest networks ever built.",
  "Standard QUBIC transfers are completely feeless. Smart contract fees are burned to control supply.",
  "Qubic launched with zero VC funding, no pre-mine, and no ICO — fully community-driven from day one.",
  "Qubic nodes run on bare-metal hardware with no virtual machines, minimizing latency to the absolute floor.",
  "Exactly 676 validators called Computors secure the network. The bottom performers are rotated out every week.",
  "Qubic has mined other networks like Monero with its decentralized compute, then used the proceeds to buy and burn QUBIC.",
  "The top 451 of 676 Computors reach quorum each tick — roughly every 1.5 seconds.",
  "There is a fixed supply of 1 quadrillion QUBIC — no inflation, ever.",
];

type Phase = "checking" | "downloading" | "installing" | "up-to-date" | "error";

export default function SplashScreen() {
  const navigate = useNavigate();
  const [hydrated, setHydrated] = useState(() => usePersistedStore.persist.hasHydrated());
  const vaults = usePersistedStore((s) => s.vaults);
  const isLocked = useSessionStore((s) => s.isLocked);

  const [phase, setPhase] = useState<Phase>("checking");
  const [progress, setProgress] = useState(0);
  const [factIdx, setFactIdx] = useState(0);

  // Hydration
  useEffect(() => {
    const unsub = usePersistedStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(usePersistedStore.persist.hasHydrated());
    const timer = setTimeout(() => setHydrated(true), 3000);
    return () => { unsub(); clearTimeout(timer); };
  }, []);

  // Cycle fun facts
  useEffect(() => {
    const id = setInterval(() => setFactIdx((i) => (i + 1) % FACTS.length), 4000);
    return () => clearInterval(id);
  }, []);

  // Update check — runs immediately on mount
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const update = await check();
        if (cancelled) return;

        if (!update) {
          setPhase("up-to-date");
          return;
        }

        setPhase("downloading");
        let downloaded = 0;
        let total = 0;

        await update.downloadAndInstall((event) => {
          if (event.event === "Started") {
            total = event.data.contentLength ?? 0;
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            setProgress(total > 0 ? Math.round((downloaded / total) * 100) : 0);
          } else if (event.event === "Finished") {
            setProgress(100);
          }
        });

        setPhase("installing");
        await relaunch();
      } catch {
        if (!cancelled) setPhase("error");
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  // Navigate once hydrated and the update check is settled
  const canNavigate = phase === "up-to-date" || phase === "error";
  useEffect(() => {
    if (!hydrated || !canNavigate) return;
    const delay = phase === "up-to-date" ? 600 : 0;
    const timer = setTimeout(() => {
      if (vaults.length === 0) navigate("/setup", { replace: true });
      else if (isLocked) navigate("/lock", { replace: true });
      else navigate("/dashboard", { replace: true });
    }, delay);
    return () => clearTimeout(timer);
  }, [hydrated, canNavigate, phase, vaults.length, isLocked, navigate]);

  const statusLabel: Record<Phase, string> = {
    checking: "CHECKING FOR UPDATES...",
    downloading: progress > 0 ? `DOWNLOADING UPDATE... ${progress}%` : "DOWNLOADING UPDATE...",
    installing: "INSTALLING...",
    "up-to-date": "UP TO DATE",
    error: "CONTINUING...",
  };

  const isBlocking = phase === "downloading" || phase === "installing";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--color-bg-base)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--space-12) var(--space-8)",
        userSelect: "none",
      }}
    >
      {/* Logo */}
      <div />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-3)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.2em" }}>
          SIGIL
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-headline)", fontWeight: 500, color: "var(--color-text-display)", textAlign: "center" }}>
          Your keys.<br />Your Qubic.
        </div>
      </div>

      {/* Bottom: fact + progress */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* Fun fact */}
        <p
          key={factIdx}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-mono-sm)",
            color: "var(--color-text-disabled)",
            letterSpacing: "0.04em",
            lineHeight: 1.6,
            textAlign: "center",
            margin: 0,
            animation: "fadein 0.4s ease",
          }}
        >
          {FACTS[factIdx]}
        </p>

        {/* Progress bar — only during download */}
        {isBlocking && (
          <div style={{ width: "100%", height: 2, background: "var(--color-border-subtle)", borderRadius: 1 }}>
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: "var(--color-accent)",
                borderRadius: 1,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        )}

        {/* Status */}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.08em", textAlign: "center" }}>
          {statusLabel[phase]}
        </div>
      </div>

      <style>{`@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
