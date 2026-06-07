import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";
import { recordRuntimeIssue } from "@/lib/runtime-issues";

export interface UpdaterContext {
  platform: "linux" | "windows" | "macos";
  packageKind: "appimage" | "system_package" | "nsis" | "app_bundle";
  supportsAutoUpdate: boolean;
  reason: string | null;
}

interface UpdaterStoreState {
  appVersion: string;
  context: UpdaterContext | null;
  update: Update | null;
  checking: boolean;
  upToDate: boolean;
  checkError: boolean;
  installError: boolean;
  installing: boolean;
  progress: number;
  lastCheckedAt: number | null;
  lastError: string;
  initialized: boolean;
  init: () => Promise<void>;
  install: () => Promise<void>;
  resetError: () => void;
}

function updaterErrorMessage(prefix: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  return detail ? `${prefix}: ${detail}` : prefix;
}

export const useUpdaterStore = create<UpdaterStoreState>()((set, get) => ({
  appVersion: "",
  context: null,
  update: null,
  checking: true,
  upToDate: false,
  checkError: false,
  installError: false,
  installing: false,
  progress: 0,
  lastCheckedAt: null,
  lastError: "",
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true, checking: true });

    const [versionResult, contextResult] = await Promise.allSettled([
      getVersion(),
      invoke<UpdaterContext>("get_updater_context"),
    ]);

    if (versionResult.status === "fulfilled") {
      set({ appVersion: versionResult.value });
    }

    let context: UpdaterContext | null = null;
    if (contextResult.status === "fulfilled") {
      context = contextResult.value;
      set({ context });
    } else {
      const detail = updaterErrorMessage("Unable to determine updater context", contextResult.reason);
      // Safe fallback: disable auto-update so the UI hides the update button.
      // We deliberately avoid guessing the platform/packageKind — an incorrect
      // guess (e.g. "windows"/"nsis" on Linux AppImage) would cause the updater
      // to attempt an install that cannot succeed.
      context = {
        platform: "linux",
        packageKind: "system_package",
        supportsAutoUpdate: false,
        reason: "Unable to determine update context",
      };
      set({
        context,
        checkError: true,
        lastError: detail,
      });
      recordRuntimeIssue({
        source: "updater",
        title: "Updater context failed",
        detail,
      });
    }

    if (context && !context.supportsAutoUpdate) {
      set({
        checking: false,
        upToDate: false,
        checkError: false,
        update: null,
        lastCheckedAt: Date.now(),
        lastError: context.reason ?? "",
      });
      return;
    }

    try {
      const update = await check();
      set({
        update,
        upToDate: !update,
        checkError: false,
        lastCheckedAt: Date.now(),
        lastError: "",
      });
    } catch (error) {
      const detail = updaterErrorMessage("Update check failed", error);
      set({
        checkError: true,
        lastError: detail,
      });
      recordRuntimeIssue({
        source: "updater",
        title: "Updater check failed",
        detail,
      });
    } finally {
      set({ checking: false });
    }
  },

  install: async () => {
    const { update, context } = get();
    if (!update) return;
    if (context && !context.supportsAutoUpdate) {
      set({ lastError: context.reason ?? "Auto-update is not supported for this installation." });
      return;
    }

    set({ installing: true, installError: false, progress: 0, lastError: "" });
    let downloaded = 0;
    let total = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          set({ progress: total > 0 ? Math.round((downloaded / total) * 100) : 0 });
        }
      });
      await relaunch();
    } catch (error) {
      const detail = updaterErrorMessage("Update install failed", error);
      set({
        installing: false,
        installError: true,
        lastError: detail,
      });
      recordRuntimeIssue({
        source: "updater",
        title: "Updater install failed",
        detail,
      });
    }
  },

  resetError: () => set({ lastError: "", checkError: false, installError: false }),
}));
