import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bartendaz.pro",
  appName: "Bartendaz Pro",
  webDir: "dist/client",
  // ─── Live URL mode ───────────────────────────────────────────────────────
  // The Android app loads your deployed site directly.
  // No separate SPA build needed — just deploy normally and this picks it up.
  // Replace the URL below with your actual deployed domain once you have it.
  // Comment this out to use a local build instead.
  server: {
    url: "https://bartendazpro.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
  plugins: {
    Camera: {},
    Filesystem: {},
    Share: {},
  },
  android: {
    backgroundColor: "#000000",
  },
};

export default config;
