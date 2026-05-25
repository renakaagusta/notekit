import { useEffect, useState } from "react";
import { Apple, Github } from "lucide-react";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { NoteKitMark, NoteKitWordmark } from "./NoteKitLogo";

interface SignInProps {
  providers: { github: boolean; google: boolean; apple: boolean } | null;
  onSignIn(provider: "github" | "google" | "apple"): void;
}

export function SignIn({ providers, onSignIn }: SignInProps) {
  const [authError, setAuthError] = useState<string | null>(null);
  // Follow the OS appearance — no user preference exists pre-auth.
  // Dropped the mobile PAT-mode state (tokenMode / tokenInput /
  // showTokenPath / isCapacitorNative) since the components those
  // depend on aren't on main yet — bring them over with the mobile
  // shell commits if needed.
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
          {providers && !providers.github && !providers.google && (
            <p className="nk-signin-hint">
              No OAuth providers configured. See{" "}
              <code>apps/api/.env.example</code> to set up GitHub and Google.
            </p>
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
