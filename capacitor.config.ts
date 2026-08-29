import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.njfamirm.taraz",
  appName: "تراز",
  webDir: "dist",
  android: {
    // Persian/RTL app; no cleartext traffic — everything is local.
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_taraz",
      iconColor: "#4B7BEC",
    },
  },
};

export default config;
