export type MemberKind = "user" | "agent";

export interface Member {
  kind: MemberKind;
  id: string;
  name: string;
}

export interface MembersFile {
  users: { id: string; name: string }[];
  agents: { id: string; name: string }[];
}

/** Assignee string format: "user:<id>" or "agent:<id>". Legacy strings (no prefix) render as-is. */
export interface AssigneeRef {
  kind: MemberKind | "legacy";
  id: string;
  /** Display label, resolved from members file when possible. */
  display: string;
}
