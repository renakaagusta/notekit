#!/usr/bin/env node
/**
 * One-time setup: create the NoteKit GitHub App via GitHub's App-manifest flow.
 *
 * GitHub doesn't let you create an App from a plain API token (security), but
 * the manifest flow pre-fills every setting and returns the credentials
 * automatically after a single "Create GitHub App" click in the browser.
 *
 *   node scripts/setup-github-app.mjs
 *
 * It opens a browser → you click "Create GitHub App" → the App is created with
 * the correct permissions and its credentials (App ID, private key, client
 * secret, webhook secret) are written to ./github-app-creds.json. Hand that file
 * over and it gets patched into Vault (secret/notekit) as GITHUB_APP_*.
 *
 * Overridable via env: APP_NAME, PORT, NOTEKIT_BASE_URL, NOTEKIT_API_URL,
 * NOTEKIT_APP_URL.
 */
import http from "node:http";
import crypto from "node:crypto";
import { exec } from "node:child_process";
import fs from "node:fs";

const PORT = Number(process.env.PORT ?? 7331);
const state = crypto.randomBytes(16).toString("hex");
const BASE = process.env.NOTEKIT_BASE_URL ?? "https://notekit.online";
const API = process.env.NOTEKIT_API_URL ?? "https://api.notekit.online";
const APP = process.env.NOTEKIT_APP_URL ?? "https://app.notekit.online";
const NAME = process.env.APP_NAME ?? "NoteKit Vault";

// The App the user grants access to. Contents(write) = read/write vault files;
// Metadata(read) = list repos; Administration(write) = create/manage repos.
// callback_urls enables the user-to-server (OAuth) token used for user actions
// like creating a repo in a personal account; redirect_url is only the
// manifest-flow return that hands us the credentials.
const manifest = {
  name: NAME,
  url: BASE,
  hook_attributes: { url: `${API}/webhooks/github-app`, active: false },
  redirect_url: `http://localhost:${PORT}/callback`,
  callback_urls: [`${API}/auth/github-app/callback`],
  setup_url: `${APP}/settings/vaults`,
  setup_on_update: false,
  public: false,
  request_oauth_on_install: true,
  default_permissions: {
    contents: "write",
    metadata: "read",
    administration: "write",
  },
  default_events: [],
};

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Create NoteKit GitHub App</title></head>
<body style="font-family:system-ui;padding:40px;max-width:640px;margin:auto">
<h2>Creating the NoteKit GitHub App…</h2>
<p>You'll be sent to GitHub — review the settings and click <b>Create GitHub App</b>.</p>
<form id="f" action="https://github.com/settings/apps/new?state=${state}" method="post">
<input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, "&#39;")}'>
<button type="submit" style="padding:10px 18px;font-size:15px;cursor:pointer">Continue to GitHub →</button>
</form>
<script>setTimeout(()=>document.getElementById("f").submit(),400)</script>
</body></html>`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  if (u.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(page);
    return;
  }

  if (u.pathname === "/callback") {
    if (u.searchParams.get("state") !== state) {
      res.writeHead(400).end("state mismatch — restart the script");
      return;
    }
    const code = u.searchParams.get("code");
    if (!code) {
      res.writeHead(400).end("no code in callback");
      return;
    }
    try {
      const r = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
        method: "POST",
        headers: { Accept: "application/vnd.github+json", "User-Agent": "notekit-setup" },
      });
      const app = await r.json();
      if (!r.ok) throw new Error(`conversion HTTP ${r.status}: ${JSON.stringify(app)}`);

      fs.writeFileSync("github-app-creds.json", JSON.stringify(app, null, 2), { mode: 0o600 });
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<body style="font-family:system-ui;padding:40px"><h2>✅ GitHub App created: ${app.slug}</h2>` +
          `<p>App ID <b>${app.id}</b>. Credentials saved locally. You can close this tab.</p></body>`,
      );
      console.log(`\n✅ Created GitHub App "${app.slug}" (App ID ${app.id})`);
      console.log(`   Client ID: ${app.client_id}`);
      console.log(`   Install URL: https://github.com/apps/${app.slug}/installations/new`);
      console.log(`   Full creds (App ID + private key + client secret + webhook secret)`);
      console.log(`   → saved to ./github-app-creds.json — hand it over to patch into Vault.\n`);
    } catch (err) {
      res.writeHead(500).end(String(err));
      console.error("conversion failed:", err);
    } finally {
      setTimeout(() => { server.close(); process.exit(0); }, 400);
    }
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\nGitHub App setup — opening ${url}`);
  console.log(`(If the browser doesn't open, visit that URL manually.)\n`);
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${opener} "${url}"`);
});
