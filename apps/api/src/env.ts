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
  sessionSecret: (() => {
    const s = process.env.SESSION_SECRET;
    const INSECURE_DEFAULTS = [
      "dev-insecure-secret-change-me",
      "secret",
      "changeme",
      "password",
      "insecure",
    ];
    if (!s || INSECURE_DEFAULTS.includes(s.toLowerCase())) {
      throw new Error(
        "SESSION_SECRET must be set to a random string of at least 32 characters. " +
          "Generate with: openssl rand -base64 32"
      );
    }
    if (s.length < 32) {
      throw new Error(
        "SESSION_SECRET is too short (must be >= 32 characters). " +
          "Generate with: openssl rand -base64 32"
      );
    }
    return s;
  })(),
  databaseUrl: (() => {
    const url = process.env.DATABASE_URL ?? "postgresql://notekit:CHANGE_ME@localhost:5432/notekit";
    if (url.includes("CHANGE_ME")) {
      throw new Error(
        "DATABASE_URL is not configured. Set DATABASE_URL in your environment or Vault secret."
      );
    }
    return url;
  })(),
  // Shared Redis on the host (used for the rate limiter). Optional: when unset
  // — e.g. local dev without Redis — the limiter fails open. Keys are namespaced
  // with `notekit:` so the shared instance stays collision-free.
  redisUrl: optional("REDIS_URL"),
  github: {
    clientId: optional("GITHUB_CLIENT_ID"),
    clientSecret: optional("GITHUB_CLIENT_SECRET"),
  },
  // GitHub App (create-centric vault backend): least-privilege access to only
  // the repos it creates/manages, via short-lived installation tokens. All
  // optional — when unset the GitHub-App vault path is simply unavailable.
  githubApp: {
    appId: optional("GITHUB_APP_ID"),
    slug: optional("GITHUB_APP_SLUG"),
    clientId: optional("GITHUB_APP_CLIENT_ID"),
    clientSecret: optional("GITHUB_APP_CLIENT_SECRET"),
    privateKey: optionalPem("GITHUB_APP_PRIVATE_KEY"),
    webhookSecret: optional("GITHUB_APP_WEBHOOK_SECRET"),
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
    // Forgejo requires HTTP Basic auth (not a token) to create access tokens,
    // so per-user token minting needs the admin's username + password (used
    // with a `Sudo:` header to act as the target user). Token-only admin ops
    // (create user, etc.) still use adminToken above.
    adminUser: optional("FORGEJO_ADMIN_USER"),
    adminPassword: optional("FORGEJO_ADMIN_PASSWORD"),
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
  // Superadmin backoffice (apps/backoffice). better-auth runs under
  // /backoffice/auth; only these emails may sign in and reach /backoffice/*.
  backoffice: {
    // Comma-separated allowlist of platform-admin emails.
    adminEmails: (optional("BACKOFFICE_ADMIN_EMAILS") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
    // Origin of the deployed backoffice SPA (for better-auth trustedOrigins
    // and magic-link callbacks). Defaults to the Vite dev server.
    webUrl: required("BACKOFFICE_WEB_URL", "http://localhost:5173"),
  },
  isProd: process.env.NODE_ENV === "production",
};

export function isBackofficeAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.backoffice.adminEmails.includes(email.toLowerCase());
}

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
