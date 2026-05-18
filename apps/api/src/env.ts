import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string): string | null {
  const value = process.env[name];
  return value && value.length > 0 ? value : null;
}

// Multi-line PEM keys are awkward in dotenv; we accept \n escapes and unescape them.
function optionalPem(name: string): string | null {
  const raw = optional(name);
  if (!raw) return null;
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  webUrl: required("WEB_URL", "http://localhost:5173"),
  apiUrl: required("API_URL", "http://localhost:3001"),
  sessionSecret: required("SESSION_SECRET", "dev-insecure-secret-change-me"),
  databaseUrl: required("DATABASE_URL", "file:./data/notekit.db"),
  github: {
    clientId: optional("GITHUB_CLIENT_ID"),
    clientSecret: optional("GITHUB_CLIENT_SECRET"),
  },
  google: {
    clientId: optional("GOOGLE_CLIENT_ID"),
    clientSecret: optional("GOOGLE_CLIENT_SECRET"),
  },
  telegram: {
    botToken: optional("TELEGRAM_BOT_TOKEN"),
    botUsername: optional("TELEGRAM_BOT_USERNAME"),
    webhookSecret: optional("TELEGRAM_WEBHOOK_SECRET"),
  },
  vapid: {
    publicKey: optional("VAPID_PUBLIC_KEY"),
    privateKey: optional("VAPID_PRIVATE_KEY"),
    subject: optional("VAPID_SUBJECT"),
  },
  apns: {
    keyId: optional("APNS_KEY_ID"),
    teamId: optional("APNS_TEAM_ID"),
    bundleId: optional("APNS_BUNDLE_ID"),
    keyP8: optionalPem("APNS_KEY_P8"),
    production: process.env.APNS_PRODUCTION === "true",
  },
  fcm: {
    projectId: optional("FCM_PROJECT_ID"),
    clientEmail: optional("FCM_CLIENT_EMAIL"),
    privateKey: optionalPem("FCM_PRIVATE_KEY"),
  },
  apple: {
    bundleId: optional("APPLE_BUNDLE_ID"),
    issuerId: optional("APPLE_ISSUER_ID"),
    keyId: optional("APPLE_API_KEY_ID"),
    keyP8: optionalPem("APPLE_API_KEY_P8"),
    sharedSecret: optional("APPLE_SHARED_SECRET"),
  },
  googlePlay: {
    packageName: optional("GOOGLE_PLAY_PACKAGE_NAME"),
    clientEmail: optional("GOOGLE_PLAY_CLIENT_EMAIL"),
    privateKey: optionalPem("GOOGLE_PLAY_PRIVATE_KEY"),
    pubsubSecret: optional("GOOGLE_PLAY_PUBSUB_SECRET"),
  },
  isProd: process.env.NODE_ENV === "production",
};

export function providerConfigured(name: "github" | "google"): boolean {
  const cfg = env[name];
  return Boolean(cfg.clientId && cfg.clientSecret);
}
