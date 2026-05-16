/**
 * Agent profiles live as JSON files in the user's vault repo at agents/<slug>.json.
 * The vault is the source of truth — same model as notes and tickets.
 * Git history of these files is the audit trail (creation, renames, scope changes).
 */
import { readFile, writeFile, deleteFile, listTree } from "./github";

export interface AgentProfile {
  slug: string;
  name: string;
  email: string;
  description: string;
  avatarUrl: string | null;
  createdAt: string;
}

const AGENTS_DIR = "agents";

export function agentPathFor(slug: string): string {
  return `${AGENTS_DIR}/${slug}.json`;
}

export function defaultEmailFor(slug: string): string {
  return `${slug}@agents.notekit.app`;
}

export function slugifyAgentName(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function readAgent(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  slug: string,
): Promise<{ profile: AgentProfile; sha: string } | null> {
  const file = await readFile(token, owner, repo, agentPathFor(slug), branch);
  if (!file) return null;
  try {
    const parsed = JSON.parse(file.content) as Partial<AgentProfile>;
    const profile: AgentProfile = {
      slug,
      name: parsed.name ?? slug,
      email: parsed.email ?? defaultEmailFor(slug),
      description: parsed.description ?? "",
      avatarUrl: parsed.avatarUrl ?? null,
      createdAt: parsed.createdAt ?? "",
    };
    return { profile, sha: file.sha };
  } catch {
    return null;
  }
}

export async function listAgents(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<AgentProfile[]> {
  const entries = await listTree(token, owner, repo, branch, AGENTS_DIR);
  const out: AgentProfile[] = [];
  for (const entry of entries) {
    if (!entry.path.endsWith(".json")) continue;
    const slug = entry.path.slice(AGENTS_DIR.length + 1, -".json".length);
    const file = await readFile(token, owner, repo, entry.path, branch);
    if (!file) continue;
    try {
      const parsed = JSON.parse(file.content) as Partial<AgentProfile>;
      out.push({
        slug,
        name: parsed.name ?? slug,
        email: parsed.email ?? defaultEmailFor(slug),
        description: parsed.description ?? "",
        avatarUrl: parsed.avatarUrl ?? null,
        createdAt: parsed.createdAt ?? "",
      });
    } catch {
      // skip malformed entries
    }
  }
  return out;
}

export async function writeAgent(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  profile: AgentProfile,
  prevSha?: string,
): Promise<{ sha: string }> {
  return writeFile(
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
  token: string,
  owner: string,
  repo: string,
  branch: string,
  slug: string,
  prevSha: string,
): Promise<void> {
  await deleteFile(
    token,
    owner,
    repo,
    agentPathFor(slug),
    `notekit: delete agent ${slug}`,
    branch,
    prevSha,
  );
}
