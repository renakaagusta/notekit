import { useAuth } from "../hooks/useAuth";
import { App } from "./App";
import { SignIn } from "./SignIn";

export function AuthGate() {
  const { status, providers, signIn, signOut, user } = useAuth();

  if (status === "loading") {
    return (
      <div className="nk" data-dir="studio" data-theme="dark">
        <div className="nk-signin">
          <div className="nk-signin-card">
            <div className="nk-signin-brand">NoteKit</div>
            <p className="nk-signin-tag">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="nk" data-dir="studio" data-theme="dark">
        <div className="nk-signin">
          <div className="nk-signin-card">
            <div className="nk-signin-brand">NoteKit</div>
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
