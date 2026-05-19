// Auth endpoints. Mirrors apps/api/src/routes/auth.ts.
//
// Note: OAuth start (GET /auth/:provider) and callback (GET /auth/:provider/
// callback) are browser-driven redirects, not JSON endpoints — they live as
// URL builders here so CLI / desktop can open them in the user's browser.

import type { NoteKitClient } from "../transport";
import type {
  MeResponse,
  NewPersonalAccessToken,
  PersonalAccessTokenScope,
  PersonalAccessTokenSummary,
  ProvidersResponse,
} from "../types";

export function authEndpoints(client: NoteKitClient) {
  return {
    /** GET /auth/me — returns { user: null } when not signed in. */
    async me(): Promise<MeResponse> {
      return client.request<MeResponse>("/auth/me");
    },

    /** GET /auth/providers — which OAuth providers are configured on this server. */
    async providers(): Promise<ProvidersResponse> {
      return client.request<ProvidersResponse>("/auth/providers");
    },

    /** POST /auth/signout — clears the session cookie. */
    async signOut(): Promise<void> {
      await client.request("/auth/signout", { method: "POST" });
    },

    /**
     * Build the URL the CLI / desktop opens in the browser to start the
     * loopback PKCE-style flow. The API redirects back to redirect_uri
     * with `?token=<plaintext>&state=<state>` after consent.
     */
    cliStartUrl(
      baseUrl: string,
      params: { redirect_uri: string; state: string },
    ): string {
      const u = new URL("/auth/cli/start", baseUrl);
      u.searchParams.set("redirect_uri", params.redirect_uri);
      u.searchParams.set("state", params.state);
      return u.toString();
    },

    /** GET /auth/tokens — list user's personal access tokens. */
    async listTokens(): Promise<{ tokens: PersonalAccessTokenSummary[] }> {
      return client.request("/auth/tokens");
    },

    /**
     * POST /auth/tokens — mint a token. Plaintext is in `token` and is
     * shown exactly once — store it immediately.
     */
    async createToken(input: {
      name: string;
      scope?: PersonalAccessTokenScope;
    }): Promise<NewPersonalAccessToken> {
      return client.request("/auth/tokens", { method: "POST", body: input });
    },

    /** DELETE /auth/tokens/:id — soft-revoke. Idempotent on already-revoked. */
    async revokeToken(id: string): Promise<{ ok: true }> {
      return client.request(`/auth/tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
    },

    /**
     * Build the URL to start an OAuth flow in the user's browser. CLI and
     * desktop apps use this with a loopback redirect_uri.
     */
    authorizeUrl(
      baseUrl: string,
      provider: "github" | "google",
      params: { redirect_uri: string; state: string },
    ): string {
      const u = new URL(`/auth/${provider}`, baseUrl);
      u.searchParams.set("redirect_uri", params.redirect_uri);
      u.searchParams.set("state", params.state);
      return u.toString();
    },
  };
}
