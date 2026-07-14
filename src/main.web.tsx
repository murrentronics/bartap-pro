import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Web entry point — no Capacitor, no native plugins.
// Used for the Safari/browser build served at bartendazpro-web.pages.dev

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
