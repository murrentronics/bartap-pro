import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";

// Initialize status bar for Android
if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark })
    .catch(() => {/* ignore */});
  StatusBar.setBackgroundColor({ color: "#0a0a0a" })
    .catch(() => {/* ignore */});
  StatusBar.setOverlaysWebView({ overlay: false })
    .catch(() => {/* ignore */});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
