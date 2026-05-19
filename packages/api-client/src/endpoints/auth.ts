// Auth endpoints. Mirrors apps/api/src/routes/auth.ts.
//
// Note: OAuth start (GET /auth/:provider) and callback (GET /auth/:provider/
// callback) are browser-driven redirects, not JSON endpoints — they live as
// URL builders here so CLI / desktop can open them in the user's browser.

import type { NoteKitClient } from "../transport";
import type { MeResponse, ProvidersResponse } from "../types";

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
