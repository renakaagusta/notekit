import type { AssigneeRef, Member, MembersFile } from "../types/member";

export const MEMBERS_PATH = ".notekit/members.json";

export function parseMembersFile(raw: string): MembersFile {
  const empty: MembersFile = { users: [], agents: [] };
  if (!raw.trim()) return empty;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!data || typeof data !== "object") return empty;
  const obj = data as Record<string, unknown>;
  return {
    users: normalizeList(obj.users),
    agents: normalizeList(obj.agents),
  };
}

function normalizeList(value: unknown): { id: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { id: string; name: string }[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const id = String((entry as Record<string, unknown>).id ?? "").trim();
    if (!id) continue;
    const name = String((entry as Record<string, unknown>).name ?? id).trim();
    out.push({ id, name: name || id });
  }
  return out;
}

export function flattenMembers(file: MembersFile): Member[] {
  return [
    ...file.users.map((u) => ({ kind: "user" as const, id: u.id, name: u.name })),
    ...file.agents.map((a) => ({ kind: "agent" as const, id: a.id, name: a.name })),
  ];
}

/** Build the canonical assignee string from a member. */
export function assigneeStringOf(m: Pick<Member, "kind" | "id">): string {
  return `${m.kind}:${m.id}`;
}

/** Resolve an assignee string into a renderable reference. */
export function resolveAssignee(
  raw: string | null | undefined,
  members: Member[],
): AssigneeRef | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    const prefix = trimmed.slice(0, colon);
    const id = trimmed.slice(colon + 1).trim();
    if ((prefix === "user" || prefix === "agent") && id) {
      const found = members.find((m) => m.kind === prefix && m.id === id);
      return {
        kind: prefix,
        id,
        display: found?.name ?? id,
      };
    }
  }
  // Legacy: pre-namespace assignees (plain string, e.g. an email).
  return { kind: "legacy", id: trimmed, display: trimmed };
}
