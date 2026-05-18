import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";

export default function RootScreen() {
  const navigate = useNavigate();
  const hasHydrated = usePersistedStore.persist.hasHydrated();
  const vaults = usePersistedStore((s) => s.vaults);
  const isLocked = useSessionStore((s) => s.isLocked);

  useEffect(() => {
    if (!hasHydrated) return;
    if (vaults.length === 0) {
      navigate("/setup", { replace: true });
    } else if (isLocked) {
      navigate("/lock", { replace: true });
    } else {
      navigate("/dashboard", { replace: true });
    }
  }, [hasHydrated, vaults.length, isLocked, navigate]);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-mono-sm)",
        color: "var(--color-text-disabled)",
        letterSpacing: "0.05em",
      }}
    >
      [LOADING...]
    </div>
  );
}
