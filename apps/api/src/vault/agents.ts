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
import { env } from "../env";
import * as gh from "./github";
import * as fj from "./forgejo";
import type { GitProvider } from "./tokens";

function gitOps(provider: GitProvider) {
  return provider === "notekit" ? fj : gh;
}

export interface AgentProfile {
  slug: string;
  name: string;
  email: string;
  description: string;
  createdAt: string;
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

export async function readAgent(
  provider: GitProvider,
  token: string,
  owner: string,
  repo: string,
  branch: string,
  slug: string,
): Promise<{ profile: AgentProfile; sha: string } | null> {
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
      });
    } catch {
      // skip malformed entries
    }
  }
  return out;
}

export async function writeAgent(
  provider: GitProvider,
  token: string,
  owner: string,
  repo: string,
  branch: string,
  profile: AgentProfile,
  prevSha?: string,
): Promise<{ sha: string }> {
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

export async function deleteAgentFile(
  provider: GitProvider,
  token: string,
  owner: string,
  repo: string,
  branch: string,
  slug: string,
  prevSha: string,
): Promise<void> {
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
