import { useEffect, useState } from "react";
import { Key } from "lucide-react";
import { NoteKitMark } from "./NoteKitLogo";

interface SignInProps {
  providers: { github: boolean; google: boolean; apple: boolean } | null;
  onSignIn(provider: "github" | "google" | "apple"): void;
}

/**
 * On Capacitor native (iOS/Android), expose a PAT sign-in path alongside the
 * OAuth buttons. OAuth in a Capacitor WebView is brittle (Google's WebView
 * detection, captchas) and breaks Maestro E2E completely. Power users who
 * already have a CLI/MCP token from the web app can paste it here; the API
 * client then runs in bearer mode against the same backend.
 */
function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/**
 * Whether this is a debug/E2E build. The PAT path is a developer/testing
 * backdoor, so it must never ship in the production App Store / Play build.
 * True in the Vite dev server, or when a build sets `VITE_DEBUG=true`
 * (the E2E scripts do). A plain production `vite build` leaves it undefined,
 * so the token path is hidden for real users. Literal access — Vite only
 * statically replaces `import.meta.env.VITE_*` when referenced directly.
 */
function isDebugBuild(): boolean {
  // Direct literal access so Vite statically substitutes these at build time;
  // types don't see import.meta.env (same pattern as resolveApiUrl in api.ts).
  // @ts-expect-error — Vite replaces import.meta.env.DEV at build time.
  const dev = import.meta.env.DEV === true;
  // @ts-expect-error — Vite replaces import.meta.env.VITE_DEBUG at build time.
  const debugFlag = import.meta.env.VITE_DEBUG as string | undefined;
  return dev || debugFlag === "true";
}

// A faint live-data motif for the left brand panel — a vault sync stream that
// hints at what Notekit is (encrypted notes/tickets/links/secrets in Git),
// mirroring the "market stream" motif in the Oracle auth screen.
const STREAM = `notekit sync --vault personal
✓ notes/standup-2026-07.md.age    pushed · 12ms
✓ tickets/e2ee-everywhere.age     encrypted
✓ links/read-later.age            200 · 8ms
✓ secrets/api-keys.age            sealed
  git    main ← 3 commits
  e2ee   age · 4 devices paired`;

/**
 * Standalone dark, black-&-white split-screen auth (Oracle-style): left = brand
 * + a faint live-data motif on a hairline grid, right = the provider stack.
 * Brand colors are explicit (not theme tokens) so it reads identically in light
 * or dark mode — the pre-auth screen has no user theme preference to honor.
 */
// eslint-disable-next-line max-lines-per-function, complexity -- auth screen renders brand panel, three OAuth providers, PAT token form, Capacitor checks, and error handling
export function SignIn({ providers, onSignIn }: SignInProps) {
  const [authError, setAuthError] = useState<string | null>(null);
  const [tokenMode, setTokenMode] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const showTokenPath = isCapacitorNative() && isDebugBuild();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads auth_error from URL query params on mount; this is a one-time URL parameter extraction, not a subscription
      setAuthError(err);
      params.delete("auth_error");
      const search = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (search ? `?${search}` : ""),
      );
    }
  }, []);

  const noProviders =
    providers && !providers.github && !providers.google && !providers.apple;

  return (
    <div className="nk-auth" data-theme="dark">
      {/* LEFT · brand + live-data motif */}
      <div className="nk-auth-left">
        <pre className="nk-auth-stream" aria-hidden>
          {STREAM}
        </pre>
        <div className="nk-auth-left-inner">
          <div className="nk-auth-lockup">
            <NoteKitMark size={20} />
            <span className="nk-auth-word">notekit</span>
          </div>
          <div className="nk-auth-pitch">
            <h2 className="nk-auth-h2">Your notes. Your Git. Encrypted.</h2>
            <p className="nk-auth-lead">
              Notes, tickets, links &amp; secrets — end-to-end encrypted and
              version-controlled in a Git repo you own. No lock-in, ever.
            </p>
          </div>
          <div className="nk-auth-tags">notes · tickets · links · secrets</div>
        </div>
      </div>

      {/* RIGHT · auth */}
      <div className="nk-auth-right">
        <div className="nk-auth-panel">
          {/* mobile-only lockup */}
          <div className="nk-auth-lockup nk-auth-lockup-mobile">
            <NoteKitMark size={20} />
            <span className="nk-auth-word">notekit</span>
          </div>

          <div className="nk-auth-overline">// sign in</div>
          <h1 className="nk-auth-h1">Sign in to Notekit.</h1>
          <p className="nk-auth-lead">
            Access your vault across web, desktop, mobile &amp; CLI with one
            account.
          </p>

          {authError && (
            <div className="nk-signin-error">
              Sign-in failed: {authError.replace(/_/g, " ")}
            </div>
          )}

          <div className="nk-signin-buttons">
            {/* Apple goes first per Apple HIG: when an app offers third-party
                sign-in on iOS, Sign in with Apple must be rendered at least as
                prominently as the others. Keeping it as the leading white-fill
                button in the stack satisfies that on every platform. */}
            <button
              className="nk-signin-btn nk-signin-btn-apple"
              disabled={!providers?.apple}
              onClick={() => onSignIn("apple")}
              title={
                !providers?.apple
                  ? "Apple Sign In not configured on the server"
                  : ""
              }
            >
              <AppleIcon />
              Continue with Apple
            </button>
            <button
              className="nk-signin-btn"
              disabled={!providers?.github}
              onClick={() => onSignIn("github")}
              title={
                !providers?.github
                  ? "GitHub OAuth not configured on the server"
                  : ""
              }
            >
              <GitHubIcon />
              Continue with GitHub
            </button>
            <button
              className="nk-signin-btn"
              disabled={!providers?.google}
              onClick={() => onSignIn("google")}
              title={
                !providers?.google
                  ? "Google OAuth not configured on the server"
                  : ""
              }
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </div>

          {noProviders && (
            <p className="nk-signin-hint">
              No sign-in providers configured. See{" "}
              <code>apps/api/.env.example</code> to set up GitHub, Google, or
              Apple.
            </p>
          )}

          {showTokenPath && !tokenMode && (
            <button
              className="nk-signin-btn nk-signin-btn-ghost"
              onClick={() => setTokenMode(true)}
              data-testid="signin-use-token"
            >
              <Key size={18} aria-hidden />
              Sign in with token
            </button>
          )}
          {showTokenPath && tokenMode && (
            <form
              className="nk-signin-token-form"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = tokenInput.trim();
                if (!trimmed.startsWith("nkp_") && !trimmed.startsWith("nka_")) {
                  setTokenError("Token must start with nkp_ or nka_");
                  return;
                }
                try {
                  localStorage.setItem("notekit:e2e-pat", trimmed);
                } catch (err) {
                  setTokenError(`Couldn't save token: ${(err as Error).message}`);
                  return;
                }
                // Reload so the API client picks up the new auth mode at
                // module-load. (The mode is captured at construction time.)
                window.location.reload();
              }}
            >
              <input
                type="password"
                className="nk-signin-token-input"
                placeholder="nkp_…"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={tokenInput}
                onChange={(e) => {
                  setTokenInput(e.target.value);
                  setTokenError(null);
                }}
                data-testid="signin-token-input"
              />
              {tokenError && (
                <p className="nk-signin-error" role="alert">
                  {tokenError}
                </p>
              )}
              <button
                type="submit"
                className="nk-signin-btn"
                disabled={tokenInput.trim().length === 0}
                data-testid="signin-token-submit"
              >
                Sign in
              </button>
              <button
                type="button"
                className="nk-signin-btn-link"
                onClick={() => {
                  setTokenMode(false);
                  setTokenInput("");
                  setTokenError(null);
                }}
              >
                Cancel
              </button>
            </form>
          )}

          <div className="nk-auth-rule" />
          <p className="nk-auth-foot">
            By continuing you agree to Notekit's Terms &amp; Privacy. Your keys
            never leave your devices.
          </p>
        </div>
      </div>
    </div>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.12A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.45.34-2.12V7.04H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.96l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
