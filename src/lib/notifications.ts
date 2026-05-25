import {
  isPermissionGranted,
  requestPermission,
  sendNotification as tauriSend,
} from "@tauri-apps/plugin-notification";

export function stripNotificationMarkup(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function notify(title: string, body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      // Permission may not persist across sessions on some platforms — re-request silently.
      const res = await requestPermission();
      granted = res === "granted";
    }
    if (!granted) return;
    tauriSend({
      title: stripNotificationMarkup(title),
      body: stripNotificationMarkup(body),
    });
  } catch {
    // non-critical
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    const res = await requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}
