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

/** Fire a payout alert if the payout amount meets the threshold. */
export async function checkAndFirePayoutAlert(
  amount: number,
  machineName: string,
  settings: AlertSettings
): Promise<void> {
  if (!settings.enabled) return;
  if (amount < settings.threshold) return;

  const title = `⚠️ Payout Alert — ${machineName}`;
  const body  = `$${amount.toFixed(2)} payout recorded — meets your $${settings.threshold.toLocaleString()} TT alert threshold.`;

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
          extra: null,
        }],
      });
    } catch (e) {
      console.warn("Local notification failed:", e);
    }
    return;
  }

  // Web fallback
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}
