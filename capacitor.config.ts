import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bartendaz.pro",
  appName: "Bartendaz Pro",
  webDir: "dist/client",
  // No server.url — app runs from bundled local assets on the device.
  // Users only need their own internet connection (for Supabase API calls).
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
