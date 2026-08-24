/**
 * Agent profiles live as JSON files in the user's vault repo at agents/<slug>.json.
 * The vault is the source of truth — same model as notes and tickets.
 * Git history of these files is the audit trail (creation, renames, scope changes).
 *
 * The vault backend (GitHub or NoteKit-hosted Forgejo) is selected per-call via
 * the `provider` argument; both modules expose the same readFile/writeFile/
 * deleteFile/listTree shape so this layer stays backend-agnostic.
 *
 * **Avatars are not stored on the profile.** They're served by Gravatar at
 * render time, keyed on the agent's email — so to give an agent a profile
 * picture, register that email at https://gravatar.com. Otherwise Gravatar
 * serves its default identicon. See [[agent-avatar-final-design]].
 */
import * as fj from "../adapters/driven/git/forgejo";
import * as gh from "../adapters/driven/git/github";
import { env } from "../env";
import type { GitProvider } from "./tokens";

function gitOps(provider: GitProvider) {
  return provider === "notekit" ? fj : gh;
}

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

/**
 * Extract the optional chat-persona fields from a parsed profile, omitting any
 * that are absent so we never write `undefined` into the JSON. Keeps old
 * profiles (created before these fields existed) valid — they just read back
 * without them, and the assistant applies its own defaults.
 */
type ChatFields = Pick<
  AgentProfile,
  "emoji" | "model" | "systemPrompt" | "toolPermissions" | "provider" | "baseUrl"
>;

function pickChatFields(parsed: Partial<AgentProfile>): ChatFields {
  const out: ChatFields = {};
  if (typeof parsed.emoji === "string" && parsed.emoji) out.emoji = parsed.emoji;
  if (typeof parsed.model === "string" && parsed.model) out.model = parsed.model;
  if (typeof parsed.systemPrompt === "string" && parsed.systemPrompt) {
    out.systemPrompt = parsed.systemPrompt;
  }
  if (parsed.toolPermissions === "read-only" || parsed.toolPermissions === "read-write") {
    out.toolPermissions = parsed.toolPermissions;
  }
  if (parsed.provider === "anthropic" || parsed.provider === "openai-compatible") {
    out.provider = parsed.provider;
  }
  if (typeof parsed.baseUrl === "string" && parsed.baseUrl) out.baseUrl = parsed.baseUrl;
  return out;
}

export interface ReadAgentOpts {
  provider: GitProvider;
  token: string;
  owner: string;
  repo: string;
  branch: string;
  slug: string;
}

export async function readAgent({
  provider,
  token,
  owner,
  repo,
  branch,
  slug,
}: ReadAgentOpts): Promise<{ profile: AgentProfile; sha: string } | null> {
  const file = await gitOps(provider).readFile(
    token,
    owner,
    repo,
    agentPathFor(slug),
    branch,
  );
  if (!file) return null;
  try {
    const parsed = JSON.parse(file.content) as Partial<AgentProfile>;
    const profile: AgentProfile = {
      slug,
      name: parsed.name ?? slug,
      email: parsed.email ?? defaultEmailFor(slug),
      description: parsed.description ?? "",
      createdAt: parsed.createdAt ?? "",
      ...pickChatFields(parsed),
    };
    return { profile, sha: file.sha };
  } catch {
    return null;
  }
}

export async function listAgents(
  provider: GitProvider,
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<AgentProfile[]> {
  const ops = gitOps(provider);
  const entries = await ops.listTree(token, owner, repo, branch, AGENTS_DIR);
  const out: AgentProfile[] = [];
  for (const entry of entries) {
    if (!entry.path.endsWith(".json")) continue;
    const slug = entry.path.slice(AGENTS_DIR.length + 1, -".json".length);
    const file = await ops.readFile(token, owner, repo, entry.path, branch);
    if (!file) continue;
    try {
      const parsed = JSON.parse(file.content) as Partial<AgentProfile>;
      out.push({
        slug,
        name: parsed.name ?? slug,
        email: parsed.email ?? defaultEmailFor(slug),
        description: parsed.description ?? "",
        createdAt: parsed.createdAt ?? "",
        ...pickChatFields(parsed),
      });
    } catch {
      // skip malformed entries
    }
  }
  return out;
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

export async function writeAgent({
  provider,
  token,
  owner,
  repo,
  branch,
  profile,
  prevSha,
}: WriteAgentOpts): Promise<{ sha: string }> {
  return gitOps(provider).writeFile(
    token,
    owner,
    repo,
    agentPathFor(profile.slug),
    JSON.stringify(profile, null, 2) + "\n",
    `notekit: ${prevSha ? "update" : "create"} agent ${profile.slug}`,
    branch,
    prevSha,
  );
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

export async function deleteAgentFile({
  provider,
  token,
  owner,
  repo,
  branch,
  slug,
  prevSha,
}: DeleteAgentFileOpts): Promise<void> {
  await gitOps(provider).deleteFile(
    token,
    owner,
    repo,
    agentPathFor(slug),
    `notekit: delete agent ${slug}`,
    branch,
    prevSha,
  );
}
