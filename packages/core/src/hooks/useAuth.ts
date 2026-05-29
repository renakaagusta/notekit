import { useEffect, useState } from "react";
import {
  apiUrl,
  apiFetch,
  clearDesktopToken,
  ensureDesktopAuthLoaded,
  isDesktop,
  startDesktopSignIn,
} from "../lib/api";
import { startNativeAppleSignIn } from "../lib/apple-signin";
import { getNativePlatform } from "../lib/native";
import { useAuthStore } from "../stores/authStore";
import type { User } from "../types/user";

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

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);

  const [status, setStatus] = useState<AuthStatus>("loading");
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);

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
          setStatus("anonymous");
        }
        setProviders(providerInfo);
      } catch (err) {
        console.error("[auth] failed to load session", err);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signIn]);

  useEffect(() => {
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
      } catch (err) {
        console.error("[auth] apple native sign-in failed", err);
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
      } catch (err) {
        console.error("[auth] desktop sign-in failed", err);
      }
      return;
    }
    window.location.href = `${apiUrl}/auth/${provider}`;
  }

  async function doSignOut() {
    try {
      await apiFetch("/auth/signout", { method: "POST" });
    } catch (err) {
      // Don't block the local sign-out on a remote failure — if the network
      // is gone we still want the UI to drop the session.
      console.warn("[auth] signout request failed", err);
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
