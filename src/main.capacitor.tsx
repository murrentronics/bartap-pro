import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { Capacitor } from "@capacitor/core";

// Create the notification channel for payout alerts (Android 8+ requirement)
if (Capacitor.isNativePlatform()) {
  import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
    LocalNotifications.createChannel({
      id: "payout_alerts",
      name: "Payout Alerts",
      description: "Alerts when a machine payout meets your threshold",
      importance: 4, // HIGH
      visibility: 1, // PUBLIC
      sound: "default",
      vibration: true,
      lights: true,
      lightColor: "#f97316",
    }).catch(() => {/* channel already exists or not supported */});
  }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
