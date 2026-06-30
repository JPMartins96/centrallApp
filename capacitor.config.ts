import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "pt.bombeiros.centralalarmes",
  appName: "Central Alarmes",
  webDir: "dist",

  server: {
    cleartext: true,
  },

  android: {
    allowMixedContent: true,
  },

  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
