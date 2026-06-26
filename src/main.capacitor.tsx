import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { Capacitor } from "@capacitor/core";

// Create the notification channel for payout alerts (Android 8+ requirement)
// Wrapped in try/catch — silently skips if plugin not yet compiled in
if (Capacitor.isNativePlatform()) {
  setTimeout(() => {
    import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
      LocalNotifications.createChannel({
        id: "payout_alerts",
        name: "Payout Alerts",
        description: "Alerts when a machine payout meets your threshold",
        importance: 4,
        visibility: 1,
        sound: "default",
        vibration: true,
        lights: true,
        lightColor: "#f97316",
      }).catch(() => {});
    }).catch(() => {});
  }, 2000); // delay so app loads first
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
