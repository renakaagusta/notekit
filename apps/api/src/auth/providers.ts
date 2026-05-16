import { env } from "../env";

export type ProviderName = "github" | "google";

export interface OAuthProvider {
  name: ProviderName;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  parseProfile(profile: unknown, accessToken: string): Promise<NormalizedProfile>;
}

export interface NormalizedProfile {
  providerAccountId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

function require(value: string | null, msg: string): string {
  if (!value) throw new Error(msg);
  return value;
}

export function getProvider(name: ProviderName): OAuthProvider {
  const redirectUri = `${env.apiUrl}/auth/${name}/callback`;

  if (name === "github") {
    return {
      name: "github",
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userInfoUrl: "https://api.github.com/user",
      scopes: ["read:user", "user:email", "repo"],
      clientId: require(env.github.clientId, "GITHUB_CLIENT_ID not set"),
      clientSecret: require(env.github.clientSecret, "GITHUB_CLIENT_SECRET not set"),
      redirectUri,
      async parseProfile(profile: any, accessToken: string) {
        let email: string | null = profile.email ?? null;
        if (!email) {
          // GitHub may not return a primary email on /user; fetch /user/emails.
          const res = await fetch("https://api.github.com/user/emails", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": "NoteKit",
              Accept: "application/vnd.github+json",
            },
          });
          if (res.ok) {
            const emails = (await res.json()) as Array<{
              email: string;
              primary: boolean;
              verified: boolean;
            }>;
            const primary = emails.find((e) => e.primary && e.verified);
            email = primary?.email ?? emails.find((e) => e.verified)?.email ?? null;
          }
        }
        if (!email) throw new Error("GitHub did not return a verified email");

        return {
          providerAccountId: String(profile.id),
          email,
          name: profile.name ?? profile.login ?? null,
          avatarUrl: profile.avatar_url ?? null,
        };
      },
    };
  }

  if (name === "google") {
    return {
      name: "google",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      scopes: ["openid", "email", "profile"],
      clientId: require(env.google.clientId, "GOOGLE_CLIENT_ID not set"),
      clientSecret: require(env.google.clientSecret, "GOOGLE_CLIENT_SECRET not set"),
      redirectUri,
      async parseProfile(profile: any) {
        if (!profile.email || !profile.email_verified) {
          throw new Error("Google did not return a verified email");
        }
        return {
          providerAccountId: String(profile.sub),
          email: profile.email,
          name: profile.name ?? null,
          avatarUrl: profile.picture ?? null,
        };
      },
    };
  }

  throw new Error(`Unknown provider: ${name}`);
}
