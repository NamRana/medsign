import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.medsign.app",
  appName: "MedSign",
  webDir: "out",
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#059669",
      showSpinner: false,
    },
  },
};

export default config;
