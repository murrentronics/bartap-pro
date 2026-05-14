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
    Camera: {},
    Filesystem: {},
    Share: {},
  },
  android: {
    backgroundColor: "#000000",
  },
};

export default config;
