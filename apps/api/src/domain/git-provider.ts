/**
 * Which git backend a vault lives on. NoteKit supports three: user-owned
 * GitHub repos, user-owned GitLab projects, and the NoteKit-hosted Forgejo
 * instance. This is a pure domain value — no transport, no DB.
 */
export type GitProvider = "github" | "gitlab" | "notekit";
