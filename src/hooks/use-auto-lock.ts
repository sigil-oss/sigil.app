import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "@/store/session";
import { usePersistedStore } from "@/store/persisted";

export function useAutoLock() {
  const navigate = useNavigate();
  const lock = useSessionStore((s) => s.lock);
  const isLocked = useSessionStore((s) => s.isLocked);
  const autoLockMinutes = usePersistedStore((s) => s.settings.autoLockMinutes);
  const lockOnWindowBlur = usePersistedStore((s) => s.settings.lockOnWindowBlur);

  // Keep Rust timer in sync with the persisted setting
  useEffect(() => {
    invoke("set_lock_timeout", { minutes: autoLockMinutes }).catch(() => {});
  }, [autoLockMinutes]);

  // Core lock listener + activity reset events
  useEffect(() => {
    const unlistenPromise = listen("sigil:lock", () => {
      lock();
      navigate("/lock", { replace: true });
    });

    const resetTimer = () => {
      invoke("reset_activity_timer").catch(() => {});
    };

    window.addEventListener("mousemove", resetTimer, { passive: true });
    window.addEventListener("keydown", resetTimer, { passive: true });
    window.addEventListener("click", resetTimer, { passive: true });

    return () => {
      unlistenPromise.then((fn) => fn());
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("click", resetTimer);
    };
  }, [lock, navigate]);

  // Window blur lock (paranoid mode)
  useEffect(() => {
    if (!lockOnWindowBlur) return;

    function onBlur() {
      if (!isLocked) {
        invoke("force_lock").catch(() => {});
      }
    }

    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [lockOnWindowBlur, isLocked]);
}
