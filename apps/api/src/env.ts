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
  isProd: process.env.NODE_ENV === "production",
};

export function providerConfigured(name: "github" | "google"): boolean {
  const cfg = env[name];
  return Boolean(cfg.clientId && cfg.clientSecret);
}
