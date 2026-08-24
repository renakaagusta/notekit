/**
 * Driven adapter: reads and writes agent profiles as JSON files in the user's
 * git vault (agents/<slug>.json). The vault backend (GitHub or NoteKit-hosted
 * Forgejo) is selected per-call via the `provider` argument; both modules
 * expose the same readFile/writeFile/deleteFile/listTree shape so this layer
 * stays backend-agnostic.
 *
 * Pure agent types, defaults, and dependency-free helpers live in
 * `domain/agents`; this module is only the git-file I/O.
 */
import {
  agentPathFor,
  defaultEmailFor,
  type AgentProfile,
  type DeleteAgentFileOpts,
  type ReadAgentOpts,
  type WriteAgentOpts,
} from "../../../domain/agents";
import type { GitProvider } from "../../../domain/git-provider";
import * as fj from "../git/forgejo";
import * as gh from "../git/github";

function gitOps(provider: GitProvider) {
  return provider === "notekit" ? fj : gh;
}

const AGENTS_DIR = "agents";

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
