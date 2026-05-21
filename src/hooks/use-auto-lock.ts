import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "@/store/session";
import { usePersistedStore } from "@/store/persisted";

/** Registers Tauri lock listeners, syncs auto-lock settings to Rust, and resets the activity timer on user interaction. */
export function useAutoLock() {
  const navigate = useNavigate();
  const lock = useSessionStore((s) => s.lock);
  const isLocked = useSessionStore((s) => s.isLocked);
  const autoLockMinutes = usePersistedStore((s) => s.settings.autoLockMinutes);
  const lockOnWindowBlur = usePersistedStore((s) => s.settings.lockOnWindowBlur);
  const lockOnSleep = usePersistedStore((s) => s.settings.lockOnSleep);
  const devMode = usePersistedStore((s) => s.settings.debugMode);

  // Keep Rust timer in sync with persisted settings
  useEffect(() => {
    invoke("set_lock_timeout", { minutes: autoLockMinutes }).catch(() => {});
  }, [autoLockMinutes]);

  useEffect(() => {
    invoke("set_lock_on_sleep", { enabled: lockOnSleep }).catch(() => {});
  }, [lockOnSleep]);

  // Core lock listener + activity reset events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;

    listen("sigil:lock", () => {
      invoke("lock_clipboard").catch(() => {});
      lock();
      navigate("/lock", { replace: true });
    }).then((fn) => {
      if (!active) fn();
      else unlisten = fn;
    });

    const resetTimer = () => {
      invoke("reset_activity_timer").catch(() => {});
    };

    window.addEventListener("mousemove", resetTimer, { passive: true });
    window.addEventListener("keydown", resetTimer, { passive: true });
    window.addEventListener("click", resetTimer, { passive: true });
    window.addEventListener("wheel", resetTimer, { passive: true });
    window.addEventListener("touchmove", resetTimer, { passive: true });

    return () => {
      active = false;
      unlisten?.();
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("click", resetTimer);
      window.removeEventListener("wheel", resetTimer);
      window.removeEventListener("touchmove", resetTimer);
    };
  }, [lock, navigate]);

  // Window blur lock (paranoid mode) — disabled in dev mode and Vite dev builds
  useEffect(() => {
    if (!lockOnWindowBlur) return;

    function onBlur() {
      if (!isLocked && !import.meta.env.DEV && !devMode) {
        invoke("force_lock").catch(() => {});
      }
    }

    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [lockOnWindowBlur, isLocked, devMode]);
}
