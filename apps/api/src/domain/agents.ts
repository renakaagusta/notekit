/**
 * Agent profiles live as JSON files in the user's vault repo at agents/<slug>.json.
 * The vault is the source of truth — same model as notes and tickets.
 * Git history of these files is the audit trail (creation, renames, scope changes).
 *
 * **Avatars are not stored on the profile.** They're served by Gravatar at
 * render time, keyed on the agent's email — so to give an agent a profile
 * picture, register that email at https://gravatar.com. Otherwise Gravatar
 * serves its default identicon. See [[agent-avatar-final-design]].
 *
 * This is the pure domain layer: types, defaults, and dependency-free helpers.
 * The git-file I/O lives in the agentStore driven adapter.
 */
import { env } from "../env";
import type { GitProvider } from "./git-provider";

/** Chat model an agent uses when driven from the in-app AI assistant. */
export type AgentModel = string;
/** Whether an agent may mutate the vault (create/edit/delete) or only read. */
export type AgentToolPermissions = "read-only" | "read-write";
/** Which API a profile talks to: Anthropic direct, or any OpenAI-compatible endpoint. */
export type AgentProvider = "anthropic" | "openai-compatible";

export const DEFAULT_AGENT_MODEL: AgentModel = "claude-3-5-haiku-latest";

export interface AgentProfile {
  slug: string;
  name: string;
  email: string;
  description: string;
  createdAt: string;
  /** Emoji shown in the AI assistant's profile picker (git avatar stays Gravatar). */
  emoji?: string;
  /** Model id the in-app assistant uses for this profile. */
  model?: AgentModel;
  /** Persona / instructions injected as the system prompt for chat. */
  systemPrompt?: string;
  /** Read-only agents cannot run create/edit/delete tools. Defaults to read-only. */
  toolPermissions?: AgentToolPermissions;
  /** API family. Defaults to anthropic. */
  provider?: AgentProvider;
  /** Base URL for openai-compatible providers (e.g. a self-hosted router). */
  baseUrl?: string;
}

const AGENTS_DIR = "agents";

export function agentPathFor(slug: string): string {
  return `${AGENTS_DIR}/${slug}.json`;
}

/**
 * Default email for a freshly-created agent.
 *
 * `AGENT_EMAIL_PATTERN` (literal string, or template with `{slug}`) wins
 * when set; falls back to the legacy `AGENT_EMAIL_DOMAIN` shorthand for
 * `{slug}@<domain>`. The recommended value is a Gravatar-registered email
 * you own (e.g. `renaka.agusta@onlinebiz.co.id`) — see env.ts for context
 * on why we landed there after trying Gmail+aliasing and GH noreply.
 */
export function defaultEmailFor(slug: string): string {
  if (env.agents.emailPattern) {
    return env.agents.emailPattern.replace("{slug}", slug);
  }
  return `${slug}@${env.agents.emailDomain}`;
}

export function slugifyAgentName(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export interface ReadAgentOpts {
  provider: GitProvider;
  token: string;
  owner: string;
  repo: string;
  branch: string;
  slug: string;
}

export interface WriteAgentOpts {
  provider: GitProvider;
  token: string;
  owner: string;
  repo: string;
  branch: string;
  profile: AgentProfile;
  prevSha?: string;
}

export interface DeleteAgentFileOpts {
  provider: GitProvider;
  token: string;
  owner: string;
  repo: string;
  branch: string;
  slug: string;
  prevSha: string;
}
