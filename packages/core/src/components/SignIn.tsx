import { useEffect, useState } from "react";

interface SignInProps {
  providers: { github: boolean; google: boolean } | null;
  onSignIn(provider: "github" | "google"): void;
}

export function SignIn({ providers, onSignIn }: SignInProps) {
  const [authError, setAuthError] = useState<string | null>(null);

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
    <div className="nk" data-dir="studio" data-theme="dark">
      <div className="nk-signin">
        <div className="nk-signin-card">
          <div className="nk-signin-brand">NoteKit</div>
          <p className="nk-signin-tag">
            Notes &amp; tickets in your Git repo.
          </p>
          {authError && (
            <div className="nk-signin-error">
              Sign-in failed: {authError.replace(/_/g, " ")}
            </div>
          )}
          <div className="nk-signin-buttons">
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

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 .5a11.5 11.5 0 0 0-3.635 22.41c.575.105.785-.25.785-.555 0-.275-.01-1.005-.015-1.97-3.2.695-3.876-1.54-3.876-1.54-.523-1.33-1.278-1.685-1.278-1.685-1.045-.715.08-.7.08-.7 1.155.08 1.764 1.187 1.764 1.187 1.028 1.762 2.697 1.253 3.353.957.104-.744.402-1.253.732-1.541-2.554-.29-5.24-1.277-5.24-5.682 0-1.255.448-2.282 1.183-3.087-.118-.291-.513-1.463.113-3.05 0 0 .965-.309 3.165 1.18a10.97 10.97 0 0 1 5.762 0c2.198-1.489 3.162-1.18 3.162-1.18.628 1.587.233 2.759.114 3.05.738.805 1.182 1.832 1.182 3.087 0 4.418-2.69 5.388-5.252 5.672.412.355.78 1.057.78 2.13 0 1.538-.014 2.778-.014 3.156 0 .307.207.665.79.552A11.502 11.502 0 0 0 12 .5z" />
    </svg>
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
