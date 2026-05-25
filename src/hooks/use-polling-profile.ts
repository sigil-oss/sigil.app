import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";

export type PollingMode = "active" | "background" | "tray_hidden" | "locked";

function readVisibilityMode(hideToTray: boolean): PollingMode {
  if (typeof document === "undefined") return "active";
  if (!document.hidden) return "active";
  return hideToTray ? "tray_hidden" : "background";
}

export function usePollingMode(): PollingMode {
  const hideToTray = usePersistedStore((s) => s.settings.hideToTray);
  const isLocked = useSessionStore((s) => s.isLocked);
  const [visibilityMode, setVisibilityMode] = useState<PollingMode>(() => readVisibilityMode(hideToTray));

  useEffect(() => {
    const sync = () => setVisibilityMode(readVisibilityMode(hideToTray));
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
    };
  }, [hideToTray]);

  if (isLocked) return "locked";
  return visibilityMode;
}

export function usePollingIntervalMs(): number {
  const mode = usePollingMode();
  const settings = usePersistedStore(
    useShallow((s) => ({
      active: s.settings.pollingIntervalActiveMs,
      background: s.settings.pollingIntervalBackgroundMs,
      trayHidden: s.settings.pollingIntervalTrayMs,
      locked: s.settings.pollingIntervalLockedMs,
    }))
  );

  switch (mode) {
    case "background":
      return settings.background;
    case "tray_hidden":
      return settings.trayHidden;
    case "locked":
      return settings.locked;
    default:
      return settings.active;
  }
}
