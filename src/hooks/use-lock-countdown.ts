import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { usePersistedStore } from "@/store/persisted";

/** Returns seconds until auto-lock, or null when disabled. Only non-null when ≤ 60 s remain so callers can show a warning. */
export function useLockCountdown(): number | null {
  const autoLockMinutes = usePersistedStore((s) => s.settings.autoLockMinutes);
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (autoLockMinutes === 0) {
      setSeconds(null);
      return;
    }

    async function poll() {
      try {
        const secs = await invoke<number | null>("get_seconds_until_lock");
        setSeconds(secs !== null && secs <= 60 ? secs : null);
      } catch {
        setSeconds(null);
      }
    }

    poll();
    const id = setInterval(poll, 5_000);
    return () => clearInterval(id);
  }, [autoLockMinutes]);

  return seconds;
}
