import { useEffect, useState } from "react";
import { apiUrl, apiFetch } from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import type { User } from "../types/user";

interface MeResponse {
  user: (Omit<User, "createdAt"> & { createdAt?: string }) | null;
}

interface ProvidersResponse {
  github: boolean;
  google: boolean;
}

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

  function startSignIn(provider: "github" | "google") {
    window.location.href = `${apiUrl}/auth/${provider}`;
  }

  async function doSignOut() {
    try {
      await apiFetch("/auth/signout", { method: "POST" });
    } finally {
      signOut();
      setStatus("anonymous");
    }
  }

  return { status, user, providers, signIn: startSignIn, signOut: doSignOut };
}
