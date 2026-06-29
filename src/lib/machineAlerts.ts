/**
 * machineAlerts.ts
 *
 * Local-notification alert system for machine payout thresholds.
 * Settings are persisted in localStorage so they survive app restarts.
 *
 * On Android (Capacitor) we request permission once and fire a
 * LocalNotification whenever a payout meets or exceeds the threshold.
 * On web the permission API is used with the browser Notification API
 * as a fallback (best-effort — not all browsers support it).
 *
 * In-app alert: when the owner is looking at the app (document is visible),
 * Android suppresses local notifications, so we also fire a Sonner toast
 * so the owner always sees the alert regardless of app state.
 *
 * Deep-link: tapping the notification navigates to /machines so the owner
 * lands directly on the machines page to see the record.
 */
import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "machine_alert_settings";

export type AlertSettings = {
  enabled: boolean;
  threshold: number; // TT dollars
};

export const THRESHOLD_OPTIONS = [500, 1000, 1500, 2000, 3000, 5000, 10000];

export function loadAlertSettings(): AlertSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AlertSettings;
  } catch { /* ignore */ }
  return { enabled: false, threshold: 1000 };
}

export function saveAlertSettings(settings: AlertSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Sync alert settings to Supabase so the edge function can read them server-side. */
export async function syncAlertSettingsToServer(
  ownerId: string,
  settings: AlertSettings
): Promise<void> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await (supabase as any).from("machine_alert_settings").upsert(
      {
        owner_id: ownerId,
        enabled: settings.enabled,
        threshold: settings.threshold,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" }
    );
  } catch (e) {
    console.warn("Failed to sync alert settings to server:", e);
  }
}

/** Request notification permission (call once on first enable). */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const { display } = await LocalNotifications.requestPermissions();
      return display === "granted";
    } catch { return false; }
  }
  // Web fallback
  if ("Notification" in window) {
    const perm = await Notification.requestPermission();
    return perm === "granted";
  }
  return false;
}

/** Key used to tell MachinesPage which machine to auto-open after an alert tap */
export const ALERT_OPEN_MACHINE_KEY = "payout_alert_open_machine";

/**
 * Register a one-time listener so tapping a payout alert notification
 * navigates the app to /machines and opens the specific machine.
 * Call this once when the Machines page mounts. Returns a cleanup function.
 */
export async function registerPayoutAlertTapHandler(
  navigate: (to: string) => void
): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const handle = await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (action) => {
        const extra = action.notification.extra as Record<string, unknown> | null;
        if (extra?.type === "payout_alert") {
          if (extra.machineName) {
            localStorage.setItem(ALERT_OPEN_MACHINE_KEY, String(extra.machineName));
          }
          navigate("/machines");
        }
      }
    );
    return () => { handle.remove(); };
  } catch {
    return () => {};
  }
}

/** Fire a payout alert if the payout amount meets the threshold.
 *  Fires an in-app modal alert (via custom DOM event picked up by AppLayout)
 *  AND the system push notification when app is backgrounded. */
export async function checkAndFirePayoutAlert(
  amount: number,
  machineName: string,
  settings: AlertSettings,
  navigate?: (to: string) => void
): Promise<void> {
  if (!settings.enabled) return;
  if (amount < settings.threshold) return;

  const title = `⚠️ Payout Alert — ${machineName}`;
  const body  = `$${amount.toFixed(2)} payout — meets your $${settings.threshold.toLocaleString()} threshold`;

  // ── Fire in-app modal via custom DOM event (handled by AppLayout) ─────────
  window.dispatchEvent(new CustomEvent("payoutAlert", {
    detail: { title, body, machineName, navigate }
  }));

  if (Capacitor.isNativePlatform()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      // Check/request permission right before firing in case it was never granted
      const { display } = await LocalNotifications.checkPermissions();
      if (display !== "granted") {
        const { display: granted } = await LocalNotifications.requestPermissions();
        if (granted !== "granted") return;
      }
      await LocalNotifications.schedule({
        notifications: [{
          id: Date.now() % 2147483647, // keep within 32-bit int range
          title,
          body,
          schedule: { at: new Date(Date.now() + 500) },
          smallIcon: "ic_launcher",
          channelId: "payout_alerts",
          sound: "default",
          actionTypeId: "",
          // extra carries the deep-link type so the tap handler can route correctly
          extra: { type: "payout_alert", machineName },
        }],
      });
    } catch (e) {
      console.warn("Local notification failed:", e);
    }
    return;
  }

  // Web fallback — tapping a web Notification can't deep-link easily,
  // but we can focus the window and navigate via the onclick handler.
  if ("Notification" in window && Notification.permission === "granted") {
    const n = new Notification(title, { body });
    n.onclick = () => {
      window.focus();
      window.location.hash = "#/machines";
    };
  }
}
