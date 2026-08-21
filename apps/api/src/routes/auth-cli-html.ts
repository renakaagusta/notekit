import { env, providerConfigured } from "../env";

/** Tiny HTML escaper for the CLI consent pages. No user-controlled rich content. */
export function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;"
    : c === "<" ? "&lt;"
    : c === ">" ? "&gt;"
    : c === '"' ? "&quot;"
    : "&#39;",
  );
}

function htmlShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(title)}</title>
  <style>
    :root { color-scheme: dark; }
    body {
      font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
      background: #0b0b0d; color: #e7e7e9;
      max-width: 32rem; margin: 4rem auto; padding: 1.5rem;
    }
    h1 { font-size: 1.2rem; margin: 0 0 .25rem; }
    p  { color: #b3b3b8; margin: .5rem 0; }
    code, .mono { font-family: ui-monospace, SFMono-Regular, monospace; font-size: .9em; color: #cfcfd6; overflow-wrap: anywhere; word-break: break-word; }
    /* Long URLs/tokens shown on their own line wrap instead of overflowing. */
    p.mono { background: #0b0b0d; border: 1px solid #2a2a31; border-radius: 6px; padding: .6rem .7rem; }
    .brand { display: flex; align-items: center; justify-content: center; gap: .55rem; margin: 0 0 2rem; font-weight: 700; letter-spacing: -.03em; font-size: 1.6rem; }
    .card { background: #16161a; border: 1px solid #2a2a31; border-radius: 8px; padding: 1.25rem; }
    .row  { display: flex; gap: .5rem; align-items: center; margin-top: 1rem; }
    button, .btn {
      font: inherit; cursor: pointer; border: 1px solid #2a2a31; border-radius: 6px;
      padding: .5rem .9rem; background: #1f1f25; color: #e7e7e9;
    }
    button.primary { background: #5b8ff9; border-color: #5b8ff9; color: #fff; }
    input[type="text"] {
      font: inherit; border: 1px solid #2a2a31; background: #0b0b0d; color: #e7e7e9;
      padding: .5rem .6rem; border-radius: 6px; width: 100%;
    }
    .muted { color: #76767e; font-size: .85em; }
  </style>
</head>
<body>
  <div class="brand">
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="10.5" y1="26" x2="21.5" y2="6" stroke="#e7e7e9" stroke-width="6.5" stroke-linecap="round" />
    </svg>
    <span>Notekit</span>
  </div>
  <div class="card">
    ${body}
  </div>
</body>
</html>`;
}

export function renderCliConsentPage(
  email: string,
  redirectUri: string,
  state: string,
  csrf: string,
  clientLabel = "CLI",
): string {
  return htmlShell(
    `Authorize ${clientLabel} · NoteKit`,
    `
      <h1>Authorize the NoteKit ${escHtml(clientLabel)}</h1>
      <p>Sign in as <strong>${escHtml(email).replace(/@/g, "&#64;")}</strong> and grant the ${escHtml(clientLabel)} an access token.</p>
      <p class="muted">Callback: <span class="mono">${escHtml(redirectUri)}</span></p>
      <form method="POST" action="/auth/cli/authorize">
        <input type="hidden" name="redirect_uri" value="${escHtml(redirectUri)}" />
        <input type="hidden" name="state" value="${escHtml(state)}" />
        <input type="hidden" name="csrf" value="${escHtml(csrf)}" />
        <label class="muted" for="label">Token label (optional)</label>
        <input type="text" id="label" name="label" placeholder="e.g. work laptop" maxlength="100" />
        <div class="row">
          <button type="submit" class="primary">Authorize</button>
          <a class="btn" href="${escHtml(env.webUrl)}">Cancel</a>
        </div>
      </form>
    `,
  );
}

export function renderCliSignInPrompt(
  redirectUri: string,
  state: string,
  clientLabel = "CLI",
): string {
  const cliStart = new URL(`${env.apiUrl}/auth/cli/start`);
  cliStart.searchParams.set("redirect_uri", redirectUri);
  cliStart.searchParams.set("state", state);
  if (clientLabel !== "CLI") cliStart.searchParams.set("client_label", clientLabel);
  const cliStartEncoded = encodeURIComponent(cliStart.toString());

  const githubBtn = providerConfigured("github")
    ? `<a class="btn provider-btn" href="${env.apiUrl}/auth/github?next=${cliStartEncoded}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
        Continue with GitHub
      </a>`
    : "";

  const googleBtn = providerConfigured("google")
    ? `<a class="btn provider-btn" href="${env.apiUrl}/auth/google?next=${cliStartEncoded}">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </a>`
    : "";

  return htmlShell(
    "Sign in · NoteKit",
    `
      <style>
        .provider-btn { display:flex; align-items:center; gap:.6rem; margin-top:.6rem; text-decoration:none; }
        .provider-btn svg { flex-shrink:0; }
      </style>
      <h1>Sign in to authorize ${escHtml(clientLabel)}</h1>
      <p>Choose a sign-in method to continue:</p>
      ${githubBtn}
      ${googleBtn}
      ${!githubBtn && !googleBtn ? `<p class="muted">No sign-in providers are configured on this server.</p>` : ""}
    `,
  );
}

export function renderCliErrorPage(message: string, redirectUri: string | null): string {
  return htmlShell(
    "CLI sign-in failed · NoteKit",
    `
      <h1>Could not authorize the CLI</h1>
      <p>${escHtml(message)}</p>
      ${redirectUri ? `<p class="muted">redirect_uri: <span class="mono">${escHtml(redirectUri)}</span></p>` : ""}
    `,
  );
}
