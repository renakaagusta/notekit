// SPDX-License-Identifier: MIT
// Driven adapter: the loopback PAT sign-in flow. The main process drives this
// to bind a one-shot HTTP server on 127.0.0.1, open the OAuth URL in the OS
// browser, and resolve with the minted bearer token once the loopback fires.

import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { openExternalUrl } from "./shell";

export interface LoopbackSignInOptions {
  apiUrl: string;
  timeoutMs: number;
  /**
   * Invoked once the loopback receives a valid token, before the outer
   * promise resolves. Used by the composition root to refocus and reload
   * the renderer so api-client picks up the freshly-keychained token.
   */
  onTokenReceived: () => void;
}

/**
 * Drive the API's CLI/loopback PAT flow from inside Electron. Mirrors what
 * `notekit login` does in the CLI, with one tweak: `client_label=Desktop`
 * makes the consent page read "Authorize the NoteKit Desktop" so users
 * understand what they're approving.
 *
 *   1. Bind a one-shot HTTP server to 127.0.0.1 on a random port.
 *   2. Open the user's external browser at
 *      ${apiUrl}/auth/cli/start?redirect_uri=...&state=...&client_label=Desktop.
 *   3. After the user signs in (if needed) and clicks Authorize, the API
 *      302s the browser to our loopback with ?token=<pat>&state=<echoed>.
 *   4. The loopback validates the state, returns a tiny success page, and
 *      resolves the outer promise with the token.
 *
 * Everything runs entirely over the loopback interface — the PAT is never
 * exposed off-host and the listening port disappears as soon as the
 * exchange completes (or after a 5-minute timeout).
 */
export async function runLoopbackSignIn(
  provider: "github" | "google",
  options: LoopbackSignInOptions,
): Promise<string> {
  const { apiUrl, timeoutMs, onTokenReceived } = options;
  const state = crypto.randomBytes(24).toString("base64url");

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      // Close the server in the next tick so the in-flight response can
      // flush its body to the browser before the socket goes away.
      setImmediate(() => server.close());
      clearTimeout(timer);
    };

    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 400;
        res.end("missing url");
        return;
      }
      const url = new URL(req.url, "http://127.0.0.1");
      // Ignore favicon, OS-level network probes, and anything that isn't
      // root. We DON'T close the server here — a stray hit on /favicon.ico
      // shouldn't burn the entire sign-in attempt.
      if (url.pathname !== "/") {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      const echoed = url.searchParams.get("state");
      // Anything that arrives without our exact state nonce is not our
      // OAuth callback — could be a random LAN probe, the user's browser
      // pre-fetching favicon, an attacker hoping to learn the port. Reply
      // 400 but keep listening so the real callback can still land.
      if (!echoed || echoed !== state) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<h1>Sign-in failed</h1><p>Unrecognized callback. You can close this window.</p>",
        );
        return;
      }
      // From here on, state matched — this is unambiguously our callback,
      // so we resolve/reject and close the server in any branch.
      const token = url.searchParams.get("token");
      if (!token) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<h1>Sign-in failed</h1><p>The callback was missing a token. You can close this window.</p>",
        );
        settle(() => reject(new Error("loopback_missing_token")));
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<h1>NoteKit Desktop signed in</h1><p>You can close this window and return to the app.</p>",
      );
      // Refocus the Electron window so the user sees the freshly signed-in
      // UI without alt-tabbing back manually.
      onTokenReceived();
      settle(() => resolve(token));
    });

    server.on("error", (err) => {
      settle(() => reject(err));
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo | null;
      if (!addr || typeof addr === "string") {
        settle(() =>
          reject(new Error("loopback_listen_failed: no address bound")),
        );
        return;
      }
      const loopback = `http://127.0.0.1:${addr.port}/`;
      const startUrl = new URL(`${apiUrl}/auth/cli/start`);
      startUrl.searchParams.set("redirect_uri", loopback);
      startUrl.searchParams.set("state", state);
      startUrl.searchParams.set("client_label", "Desktop");
      // Pre-warm the OAuth provider hint via the CLI start page: if the user
      // isn't already signed in to the API, the rendered prompt links them
      // to ${env.webUrl}/?_signin=${provider} — we don't read it from here,
      // we just append the param so the existing renderCliSignInPrompt UI
      // can pick it up in a future iteration. For now the user follows the
      // page's "Sign in to NoteKit" link, completes OAuth, comes back.
      startUrl.searchParams.set("provider_hint", provider);
      void openExternalUrl(startUrl.toString());
    });

    const timer = setTimeout(() => {
      settle(() => reject(new Error("loopback_timeout")));
    }, timeoutMs);
  });
}
