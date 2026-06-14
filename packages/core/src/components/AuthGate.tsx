import { useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { App } from "./App";
import { SignIn } from "./SignIn";
import { NoteKitMark, NoteKitWordmark } from "./NoteKitLogo";
import { SkeletonLines } from "./Skeleton";

export function AuthGate() {
  const { status, providers, signIn, signOut, user } = useAuth();

  // Pre-auth screens have no persisted user preference, so follow the
  // OS's `prefers-color-scheme`. Mirror onto <html> so the body's
  // safe-area inset paints in the matching theme background. App.tsx
  // takes over once authenticated, letting the user's saved preference
  // override the OS default.
  const preAuthTheme = useResolvedTheme();
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (status === "authenticated") return;
    document.documentElement.dataset.theme = preAuthTheme;
  }, [status, preAuthTheme]);

  if (status === "loading") {
    return (
      <div className="nk" data-dir="studio" data-theme={preAuthTheme}>
        <div className="nk-signin">
          <div className="nk-signin-card">
            <div className="nk-signin-brand">
              <NoteKitMark size={28} />
              <NoteKitWordmark />
            </div>
            <SkeletonLines count={2} />
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="nk" data-dir="studio" data-theme={preAuthTheme}>
        <div className="nk-signin">
          <div className="nk-signin-card">
            <div className="nk-signin-brand">
              <NoteKitMark size={28} />
              <NoteKitWordmark />
            </div>
            <p className="nk-signin-tag">Couldn't reach the API server.</p>
            <p className="nk-signin-hint">
              Make sure <code>pnpm --filter @notekit/api dev</code> is running
              on port 3001.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "anonymous") {
    return <SignIn providers={providers} onSignIn={signIn} />;
  }

  return <App user={user} onSignOut={signOut} />;
}
