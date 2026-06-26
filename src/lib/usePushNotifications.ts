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

        // Handle foreground push notifications (app open)
        PushNotifications.addListener("pushNotificationReceived", (notification) => {
          console.log("Push received (foreground):", notification);
          // The local notification will already show from the edge function
          // No extra action needed — OS handles background/closed state
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
