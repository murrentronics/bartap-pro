import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bartendaz.pro",
  appName: "Bartendaz Pro",
  webDir: "dist/client",
  plugins: {
    Camera: {},
    Filesystem: {},
    Share: {},
    Keyboard: {
      resize: "body",
      style: "dark",
      resizeOnFullScreen: true,
    },
  },
  android: {
    backgroundColor: "#000000",
    allowMixedContent: true,
  },
};

export default config;
