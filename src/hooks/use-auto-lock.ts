import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "@/store/session";

export function useAutoLock() {
  const navigate = useNavigate();
  const lock = useSessionStore((s) => s.lock);

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
}
