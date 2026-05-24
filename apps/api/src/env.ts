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
  // Extra CORS origins beyond `webUrl`. Comma-separated. Use this for the
  // mobile Capacitor builds (`capacitor://localhost` on iOS,
  // `https://localhost` on Android) and for any E2E runner that hits the
  // API from a non-web origin. Leave unset to keep the lock-down default.
  extraCorsOrigins: (optional("CORS_EXTRA_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
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
  // Sign in with Apple — distinct from the `apple` block below, which
  // holds StoreKit / IAP / APNs credentials. They share the same Apple
  // Developer account in practice but the keys and audiences are
  // independent: this block is the "Sign in with Apple" Service ID +
  // key pair; the lower block is the StoreKit / push side.
  appleAuth: {
    // The Service ID created in Apple Developer for the web OAuth flow
    // (`com.notekit.app.web` style). For iOS native Sign in with Apple,
    // the device sends an audience matching the App ID — `nativeAppId`
    // configures which audience to accept on /auth/apple/native.
    serviceId: optional("APPLE_AUTH_SERVICE_ID"),
    nativeAppId: optional("APPLE_AUTH_NATIVE_APP_ID"),
    // Apple Developer Team ID — 10-char string in the top-right of the
    // developer console.
    teamId: optional("APPLE_AUTH_TEAM_ID"),
    // The Key ID for the .p8 private key generated in Apple Developer
    // (Keys → Create → Sign in with Apple). Used as `kid` header on the
    // client-secret JWT we sign per token request.
    keyId: optional("APPLE_AUTH_KEY_ID"),
    // Contents of the .p8 file — multi-line PEM. dotenv collapses `\n`
    // escapes back to real newlines via optionalPem.
    privateKey: optionalPem("APPLE_AUTH_PRIVATE_KEY"),
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
  forgejo: {
    url: optional("FORGEJO_URL"),
    adminToken: optional("FORGEJO_ADMIN_TOKEN"),
    domain: optional("FORGEJO_DOMAIN"),
  },
  agents: {
    // Default email pattern for new agents. Two ways to configure:
    //
    //  AGENT_EMAIL_PATTERN  — full template with `{slug}` substitution
    //                         e.g. `myname+{slug}@gmail.com`
    //                         e.g. `<gh-id>+{slug}@users.noreply.github.com`
    //  AGENT_EMAIL_DOMAIN   — legacy shorthand for `{slug}@<domain>`
    //
    // The pattern wins when both are set. The chosen address must be
    // either (a) a Gravatar-registered email so GitHub renders the
    // avatar, or (b) a GitHub noreply form (`<id>+<slug>@users.noreply.
    // github.com`) which GitHub recognizes as belonging to that user
    // and renders their avatar with the agent's name. Gmail `+` aliases
    // (a) work cleanly because Gravatar treats them as distinct emails
    // while Gmail collapses them to your real inbox for verification.
    //
    // See docs/architecture/agent-email-routing.md.
    emailPattern: optional("AGENT_EMAIL_PATTERN"),
    emailDomain: optional("AGENT_EMAIL_DOMAIN") ?? "agents.notekit.app",
  },
  isProd: process.env.NODE_ENV === "production",
};

export function providerConfigured(name: "github" | "google" | "apple"): boolean {
  if (name === "apple") {
    const a = env.appleAuth;
    // Service ID is what we list as a web OAuth provider; the rest is
    // required to sign the per-request client-secret JWT. Native iOS
    // only needs serviceId+teamId+keyId+privateKey too (it talks to
    // the same /auth/apple/native endpoint with an audience-checked
    // identity token), so the same gate applies.
    return Boolean(a.serviceId && a.teamId && a.keyId && a.privateKey);
  }
  const cfg = env[name];
  return Boolean(cfg.clientId && cfg.clientSecret);
}
