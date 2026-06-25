import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bartendaz.pro",
  appName: "Bartendaz Pro",
  webDir: "dist/client",
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      showSpinner: false,
      backgroundColor: "#000000",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0a",
      overlaysWebView: false,
    },
    Camera: {},
    Filesystem: {},
    Share: {},
    Browser: {},
    FileOpener: {},
  },
  android: {
    backgroundColor: "#000000",
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
