export type Plan = "free" | "plus" | "lifetime";

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  plan: Plan;
  createdAt: string;
}

export type GitBackend = "notekit" | "github";

export interface GitRemote {
  backend: GitBackend;
  remoteUrl: string;
  branch: string;
  authToken: string | null;
}
