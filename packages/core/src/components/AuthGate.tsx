import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { useMediaQuery, MOBILE_BREAKPOINT } from "../hooks/useMediaQuery";
import { App } from "./App";
import { SignIn } from "./SignIn";
import { Onboarding, hasOnboarded } from "./Onboarding";
import { NoteKitMark, NoteKitWordmark } from "./NoteKitLogo";

export function AuthGate() {
  const { status, providers, signIn, signOut, user } = useAuth();
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  // First-run onboarding, shown on mobile before the sign-in screen.
  const [showOnboarding, setShowOnboarding] = useState(() => !hasOnboarded());

  // Pre-auth screens have no persisted user preference, so follow the
  // OS's `prefers-color-scheme`. Mirror onto <html> so the body's
  // safe-area inset paints in the matching theme background. App.tsx
  // takes over once authenticated, letting the user's saved preference
  // override the OS default.
  const preAuthTheme = useResolvedTheme();
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (status === "authenticated") return;
    // Prefer the cached theme (already painted by the inline <head> script)
    // over the OS preference — otherwise a signed-out dark user flashes from
    // cached-dark → OS-light during loading, then back to dark once App loads
    // their saved setting. Only fall back to OS on a first-ever visit.
    let cached: string | null = null;
    try {
      cached = localStorage.getItem("nk:theme");
    } catch {
      /* ignore */
    }
    const theme = cached === "light" || cached === "dark" ? cached : preAuthTheme;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("nk:theme", theme);
    } catch {
      /* ignore */
    }
  }, [status, preAuthTheme]);

  if (status === "loading") {
    // Minimal splash: always dark, centered logo, a small spinner near the
    // bottom — no card. Forcing dark here avoids a light flash for the split
    // second before the app resolves the saved theme.
    return (
      <div className="nk" data-dir="studio" data-theme="dark">
        <div className="nk-splash">
          <div className="nk-splash-brand">
            <NoteKitMark size={40} />
            <NoteKitWordmark />
          </div>
          <span className="nk-splash-spinner" aria-label="Loading" />
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
              Make sure <code>https://api.notekit.online</code> is reachable.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "anonymous") {
    if (isMobile && showOnboarding) {
      return (
        <div className="nk" data-dir="studio" data-theme={preAuthTheme}>
          <Onboarding onDone={() => setShowOnboarding(false)} />
        </div>
      );
    }
    return <SignIn providers={providers} onSignIn={signIn} />;
  }

  return <App user={user} onSignOut={signOut} />;
}
