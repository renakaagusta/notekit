import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the `@notekit/web` Vite build into native iOS + Android.
 * Run `pnpm --filter @notekit/web build` before `cap sync` so `webDir` exists.
 *
 * webDir points at the workspace web build output. Bundle ID and app name
 * match what's registered in the Apple Developer + Play Console accounts.
 */
const config: CapacitorConfig = {
  appId: "com.notekit.app",
  appName: "NoteKit",
  webDir: "../../packages/web/dist",
  server: {
    androidScheme: "https",
    // Comment in for local dev so the app loads from the Vite dev server
    // instead of the bundled webDir. Don't ship to production with this set.
    // url: "http://10.0.2.2:5173", // 10.0.2.2 from Android emulator → host's 5173
    // cleartext: true,
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    backgroundColor: "#000000",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
