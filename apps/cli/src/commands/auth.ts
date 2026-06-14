// `notekit auth <sub>` — login / logout / whoami.
//
// `login` runs a PKCE-style loopback flow: spin up an HTTP server on a random
// localhost port, open the API's `/auth/cli/start` URL in the browser, wait for
// the API to redirect back with `?token=...`, persist that token in the OS
// keychain.
//
// `--token <t>` skips the browser flow and accepts a token directly. Useful
// for scripted setups and for sandboxing tests against a non-default API.

import { defineCommand } from "citty";
import http from "node:http";
import { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import open from "open";
import kleur from "kleur";
import { loadConfig, patchConfig } from "../config.js";
import { getToken, setToken, clearToken } from "../keychain.js";
import { getClient, dieWithError } from "../client.js";

const login = defineCommand({
  meta: { name: "login", description: "Sign in to NoteKit and store a CLI token in your OS keychain." },
  args: {
    token: {
      type: "string",
      description: "Paste an existing token instead of running the browser flow.",
      required: false,
    },
    timeout: {
      type: "string",
      description: "Seconds to wait for browser callback (default 180).",
      required: false,
    },
  },
  async run({ args }) {
    try {
      const token = args.token
        ? args.token
        : await runBrowserFlow(parseTimeout(args.timeout));
      await setToken(token);
      // Verify before declaring success; on failure, don't leave a bad token
      // stranded in the keychain (it would make later commands fail opaquely).
      try {
        await verifyAndStoreIdentity();
      } catch (err) {
        await clearToken().catch(() => {});
        throw err;
      }
      process.stdout.write(kleur.green("Signed in.\n"));
    } catch (err) {
      dieWithError(err);
    }
  },
});

const logout = defineCommand({
  meta: { name: "logout", description: "Forget the stored CLI token." },
  async run() {
    try {
      await clearToken();
      await patchConfig({ userId: undefined, email: undefined });
      process.stdout.write(kleur.green("Signed out.\n"));
    } catch (err) {
      dieWithError(err);
    }
  },
});

const whoami = defineCommand({
  meta: { name: "whoami", description: "Print the signed-in user." },
  async run() {
    try {
      const token = await getToken();
      if (!token) {
        process.stdout.write("Not signed in.\n");
        process.exitCode = 1;
        return;
      }
      const nk = await getClient({ requireAuth: true });
      const me = await nk.auth.me();
      if (!me.user) {
        process.stdout.write("Not signed in.\n");
        process.exitCode = 1;
        return;
      }
      process.stdout.write(`${me.user.email} (${me.user.id})\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

export const authCommand = defineCommand({
  meta: { name: "auth", description: "Authentication commands." },
  subCommands: { login, logout, whoami },
});

// ── internals ──────────────────────────────────────────────────────────────

async function verifyAndStoreIdentity(): Promise<void> {
  // Hit /auth/me so the user sees an early error if the token is bad, and
  // so we can cache the user id + email in config.json. A bad/revoked token
  // does NOT 4xx here — the API replies 200 with `{ user: null }` — so we
  // must treat a null user as failure explicitly, or `login` would falsely
  // report "Signed in." for an invalid token (then every command fails).
  const nk = await getClient({ requireAuth: true });
  const me = await nk.auth.me();
  if (!me.user) {
    throw new Error(
      "That token isn't valid — the server didn't recognize it. Mint a fresh one in the web app (Account → API tokens) and try again.",
    );
  }
  await patchConfig({ userId: me.user.id, email: me.user.email });
}

/** Parse the `--timeout` flag with a sensible default and a clear error. */
function parseTimeout(raw: string | undefined): number {
  if (!raw) return 180;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--timeout must be a positive number of seconds, got: ${raw}`);
  }
  return n;
}

async function runBrowserFlow(timeoutSec: number): Promise<string> {
  const cfg = await loadConfig();
  const state = randomBytes(16).toString("hex");

  // Resolve a free port by binding to 0.
  const { server, port } = await listenOnRandomPort();

  const redirectUri = `http://127.0.0.1:${port}/callback`;
  // Build via WHATWG URL — handles trailing slashes, encodes query params,
  // and is robust to a future api-client schema change.
  const startUrlString = (() => {
    const u = new URL("/auth/cli/start", cfg.apiUrl);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    return u.toString();
  })();

  process.stdout.write(`Opening ${kleur.cyan(startUrlString)}\n`);
  process.stdout.write("Waiting for browser callback (Ctrl-C to cancel)...\n");

  // Fire and forget — if the browser doesn't open the user can copy-paste.
  open(startUrlString).catch(() => undefined);

  try {
    return await waitForCallback(server, state, timeoutSec * 1000);
  } finally {
    server.close();
  }
}

function listenOnRandomPort(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}

function waitForCallback(server: http.Server, expectedState: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("login timed out"));
    }, timeoutMs);

    server.on("request", (req, res) => {
      if (!req.url || !req.url.startsWith("/callback")) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      const url = new URL(req.url, "http://127.0.0.1");
      const token = url.searchParams.get("token");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.statusCode = 400;
        res.end(`auth failed: ${error}`);
        clearTimeout(timer);
        reject(new Error(error));
        return;
      }
      if (!token) {
        res.statusCode = 400;
        res.end("missing token");
        clearTimeout(timer);
        reject(new Error("missing token in callback"));
        return;
      }
      if (state !== expectedState) {
        res.statusCode = 400;
        res.end("state mismatch");
        clearTimeout(timer);
        reject(new Error("state mismatch — possible CSRF"));
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end("<!doctype html><meta charset=utf-8><title>Signed in</title><p>Signed in. You can close this tab.</p>");
      clearTimeout(timer);
      resolve(token);
    });
  });
}
