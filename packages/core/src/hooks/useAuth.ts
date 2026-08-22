import { useEffect, useState } from "react";
import { getNativePlatform, isNativePlatform } from "../adapters/driven/native";
import { startNativeOAuth, initNativeAuthDeepLink } from "../adapters/driven/native-oauth";
import type { User } from "../domain/entities/user";
import {
  apiUrl,
  apiFetch,
  clearDesktopToken,
  ensureDesktopAuthLoaded,
  isDesktop,
  startDesktopSignIn,
} from "../lib/api";
import { startNativeAppleSignIn } from "../lib/apple-signin";
import { useAuthStore } from "../stores/authStore";

interface MeResponse {
  user: (Omit<User, "createdAt"> & { createdAt?: string }) | null;
}

interface ProvidersResponse {
  github: boolean;
  google: boolean;
  apple: boolean;
}

export type SignInProvider = "github" | "google" | "apple";
export type AuthStatus = "loading" | "anonymous" | "authenticated" | "error";

// eslint-disable-next-line max-lines-per-function -- auth hook handles web, desktop, native iOS, and native Android sign-in flows
export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);

  const [status, setStatus] = useState<AuthStatus>("loading");
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);

  // Register the native OAuth deep-link listener once so a callback that
  // reopens the app (notekit://auth-callback?token=…) gets captured. No-op
  // off native.
  useEffect(() => {
    initNativeAuthDeepLink();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Under Electron we need the bearer token from the OS keychain
        // before the first authenticated request fires. On web this is a
        // no-op (ensureDesktopAuthLoaded short-circuits when isDesktop is
        // false) so there's no extra latency.
        await ensureDesktopAuthLoaded();
        const [{ user: me }, providerInfo] = await Promise.all([
          apiFetch<MeResponse>("/auth/me"),
          apiFetch<ProvidersResponse>("/auth/providers"),
        ]);
        if (cancelled) return;
        if (me) {
          signIn({
            id: me.id,
            email: me.email,
            name: me.name,
            avatarUrl: me.avatarUrl,
            plan: me.plan,
            createdAt: me.createdAt ?? new Date().toISOString(),
          });
          setStatus("authenticated");
        } else {
          // Server says not signed in — clear any stale persisted session.
          if (useAuthStore.getState().user) signOut();
          setStatus("anonymous");
        }
        setProviders(providerInfo);
      } catch (_err) {
        if (cancelled) return;
        // Server unreachable. If we hold a persisted session, proceed into the
        // app in offline mode (local-first) instead of blocking on an error
        // screen; /auth/me revalidates on the next launch with connectivity.
        setStatus(useAuthStore.getState().user ? "authenticated" : "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signIn, signOut]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync status when authStore user changes (e.g. after sign-in from another tab)
    if (user) setStatus("authenticated");
  }, [user]);

  async function startSignIn(provider: SignInProvider) {
    // Apple on iOS native: skip the web OAuth roundtrip and use the
    // Authentication Services framework via the Capacitor plugin so the
    // user gets the native Face ID / Touch ID sheet. The plugin hands us
    // back an identity token which the server verifies the same way it
    // verifies one from the form_post web callback.
    if (provider === "apple" && getNativePlatform() === "ios") {
      try {
        await startNativeAppleSignIn();
        window.location.reload();
      } catch (_err) {
        /* intentional noop — native sign-in failure is silent; user stays on sign-in screen */
      }
      return;
    }

    // GitHub / Google on native iOS or Android: the web cookie redirect
    // can't reach the app's WebView, so run the deep-link PAT flow — open
    // the OAuth start in an in-app browser; the appUrlOpen listener
    // (initNativeAuthDeepLink) captures the returned token and reloads.
    if (
      (provider === "github" || provider === "google") &&
      isNativePlatform()
    ) {
      try {
        await startNativeOAuth(provider);
      } catch (_err) {
        /* intentional noop — native OAuth failure is silent; user stays on sign-in screen */
      }
      return;
    }

    if (isDesktop) {
      if (provider === "apple") {
        // Desktop has no Apple-loopback flow yet — fall through to the
        // web redirect so the user at least gets *some* path. Returning
        // here so the desktop bearer-token flow above doesn't try.
        window.location.href = `${apiUrl}/auth/apple`;
        return;
      }
      // Loopback PAT flow: opens the user's external browser, waits for
      // the callback, stores the token in the OS keychain, then the main
      // process reloads this window so the next mount of useAuth picks up
      // the bearer token via ensureDesktopAuthLoaded().
      try {
        await startDesktopSignIn(provider);
      } catch (_err) {
        /* intentional noop — desktop sign-in failure is silent; user stays on sign-in screen */
      }
      return;
    }
    window.location.href = `${apiUrl}/auth/${provider}`;
  }

  async function doSignOut() {
    try {
      await apiFetch("/auth/signout", { method: "POST" });
    } catch (_err) {
      // Don't block the local sign-out on a remote failure — if the network
      // is gone we still want the UI to drop the session.
    } finally {
      if (isDesktop) {
        await clearDesktopToken();
      }
      signOut();
      setStatus("anonymous");
    }
  }

  return { status, user, providers, signIn: startSignIn, signOut: doSignOut };
}
