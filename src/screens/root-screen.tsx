import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";

function Skel({ w, h, r }: { w: string | number; h: number; r?: number }) {
  return (
    <div
      className="skeleton"
      style={{ width: w, height: h, borderRadius: r ?? "var(--radius-sharp)", flexShrink: 0 }}
    />
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* status bar */}
      <div
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          padding: "0 var(--space-4)",
          gap: "var(--space-3)",
          borderBottom: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}
      >
        <Skel w={28} h={9} />
        <div style={{ flex: 1 }} />
        <Skel w={72} h={9} />
        <div style={{ flex: 1 }} />
        <Skel w={28} h={9} />
      </div>

      {/* main content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-4)",
        }}
      >
        <Skel w={56} h={56} r={8} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-2)" }}>
          <Skel w={140} h={11} />
          <Skel w={100} h={9} />
        </div>
      </div>

      {/* bottom action */}
      <div style={{ padding: "var(--space-4) var(--space-6)", paddingBottom: "var(--space-6)" }}>
        <Skel w="100%" h={44} />
      </div>
    </div>
  );
}

export default function RootScreen() {
  const navigate = useNavigate();
  const [hydrated, setHydrated] = useState(() =>
    usePersistedStore.persist.hasHydrated()
  );
  const vaults = usePersistedStore((s) => s.vaults);
  const isLocked = useSessionStore((s) => s.isLocked);

  useEffect(() => {
    const unsub = usePersistedStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(usePersistedStore.persist.hasHydrated());
    // Safety net: if IPC hangs past the store timeout, unblock navigation anyway
    const timer = setTimeout(() => setHydrated(true), 2000);
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (vaults.length === 0) {
      navigate("/setup", { replace: true });
    } else if (isLocked) {
      navigate("/lock", { replace: true });
    } else {
      navigate("/dashboard", { replace: true });
    }
  }, [hydrated, vaults.length, isLocked, navigate]);

  return <LoadingSkeleton />;
}
