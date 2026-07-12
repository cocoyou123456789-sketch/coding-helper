import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.coocylh.tijiebu",
  appName: "题解簿",
  webDir: "dist/client",
  backgroundColor: "#fff7f9",
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
  plugins: {
    LocalNotifications: {
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
  },
};

export default config;
