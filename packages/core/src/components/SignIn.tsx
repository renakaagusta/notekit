import { useEffect, useState } from "react";
import { Apple, Github, Key } from "lucide-react";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { NoteKitMark, NoteKitWordmark } from "./NoteKitLogo";

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

export function SignIn({ providers, onSignIn }: SignInProps) {
  const [authError, setAuthError] = useState<string | null>(null);
  const [tokenMode, setTokenMode] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const showTokenPath = isCapacitorNative() && isDebugBuild();
  // Follow the OS appearance — no user preference exists pre-auth.
  const theme = useResolvedTheme();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
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

  return (
    <div className="nk" data-dir="studio" data-theme={theme}>
      <div className="nk-signin">
        <div className="nk-signin-card">
          <div className="nk-signin-brand">
            <NoteKitMark size={28} />
            <NoteKitWordmark />
          </div>
          <p className="nk-signin-tag">
            Notes &amp; tickets in your Git repo.
          </p>
          {authError && (
            <div className="nk-signin-error">
              Sign-in failed: {authError.replace(/_/g, " ")}
            </div>
          )}
          <div className="nk-signin-buttons">
            {/* Apple goes first per Apple HIG: when an app offers
                third-party sign-in on iOS, Sign in with Apple must be
                rendered at least as prominently as the others. Keeping
                it on top of the stack satisfies that on every platform
                without per-OS branching. */}
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
              <Apple size={18} aria-hidden />
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
              <Github size={18} aria-hidden />
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
          {providers &&
            !providers.github &&
            !providers.google &&
            !providers.apple && (
              <p className="nk-signin-hint">
                No sign-in providers configured. See{" "}
                <code>apps/api/.env.example</code> to set up GitHub, Google,
                or Apple.
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
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.12A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.45.34-2.12V7.04H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.96l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.2 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
