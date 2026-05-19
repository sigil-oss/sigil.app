import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";

export default function RootScreen() {
  const navigate = useNavigate();
  const [hydrated, setHydrated] = useState(() =>
    usePersistedStore.persist.hasHydrated()
  );
  const vaults = usePersistedStore((s) => s.vaults);
  const isLocked = useSessionStore((s) => s.isLocked);

  useEffect(() => {
    const unsub = usePersistedStore.persist.onFinishHydration(() =>
      setHydrated(true)
    );
    setHydrated(usePersistedStore.persist.hasHydrated());
    return unsub;
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

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-mono-sm)",
        color: "var(--color-text-disabled)",
        letterSpacing: "0.05em",
      }}
    >
      [LOADING...]
      <span style={{ fontSize: "10px", opacity: 0.6 }}>
        hydrated={String(hydrated)} vaults={vaults.length} locked={String(isLocked)}
      </span>
    </div>
  );
}
