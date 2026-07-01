/**
 * usePushNotifications
 *
 * Registers the device with FCM and stores the token in Supabase.
 * Only runs on native Android (Capacitor). No-op on web.
 *
 * Call this hook once inside the app layout when the owner is logged in.
 */
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export function usePushNotifications(ownerId: string | null | undefined) {
  useEffect(() => {
    if (!ownerId || !Capacitor.isNativePlatform()) return;

    const register = async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        // Request permission
        const { receive } = await PushNotifications.requestPermissions();
        if (receive !== "granted") return;

        // Register with FCM
        await PushNotifications.register();

        // Listen for the FCM token
        PushNotifications.addListener("registration", async (token) => {
          if (!token?.value) return;
          // Upsert token into device_tokens table
          await supabase.from("device_tokens").upsert(
            {
              owner_id: ownerId,
              token: token.value,
              platform: "android",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "owner_id,token" }
          );
        });

        // Handle foreground push notifications (app is open / screen active)
        // On Android, FCM does NOT show a heads-up notification when the app is in the
        // foreground — it delivers silently to this listener instead.
        // We re-dispatch it as the same "payoutAlert" custom event that AppLayout
        // listens to, so the in-app modal + alert sound fire just like a local notification.
        PushNotifications.addListener("pushNotificationReceived", (notification) => {
          const data  = (notification.data ?? {}) as Record<string, string>;
          const title = notification.title ?? data.title ?? "Notification";
          const body  = notification.body  ?? data.body  ?? "";
          const machineName = data.machine_name ?? "";

          window.dispatchEvent(new CustomEvent("payoutAlert", {
            detail: { title, body, machineName },
          }));
        });

        // Handle tap on a push notification when app is in background OR killed.
        // Android delivers this on resume (background) or cold start (killed).
        // We deep-link to /machines so the owner lands on the right screen.
        PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const data = (action.notification.data ?? {}) as Record<string, string>;
          if (data.type === "payout_alert") {
            if (data.machine_name) {
              // Store so MachinesPage can auto-open the right machine
              localStorage.setItem("payout_alert_open_machine", data.machine_name);
            }
            // Navigate — works both on resume and after cold start
            // Use a small delay on cold start to let the router mount first
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("pushNotificationNavigate", {
                detail: { path: "/machines" },
              }));
            }, 300);
          }
        });

      } catch (err) {
        console.warn("Push notification setup failed:", err);
      }
    };

    register();

    return () => {
      // Listeners are cleaned up by signOut() before logout.
      // This is a safety net for non-logout unmounts (e.g. dev hot-reload).
      if (Capacitor.isNativePlatform()) {
        import("@capacitor/push-notifications")
          .then(({ PushNotifications }) => PushNotifications.removeAllListeners())
          .catch(() => {});
      }
    };
  }, [ownerId]);
}
