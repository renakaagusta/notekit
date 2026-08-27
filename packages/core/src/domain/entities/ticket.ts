export type TicketStatus = "todo" | "in_progress" | "blocked" | "done" | "archived";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface Ticket {
  /**
   * Immutable file identity (nanoid). Names the file `tickets/<id>.md.age` and
   * is what links target — NEVER renamed, or links break.
   */
  id: string;
  /**
   * Human-friendly, renameable key (a slug unique per vault, e.g. `buzz-deploy`
   * / `buzz-deploy-2`). Shown instead of the opaque {@link id} when present.
   * Title-derived, so it lives in the ENCRYPTED payload, never plaintext
   * frontmatter. Optional — tickets predating this feature fall back to {@link id}.
   */
  key?: string;
  /**
   * Immutable {@link id} of this ticket's parent, when it is a subtask. Absent
   * for top-level tickets. References the parent's `id` (never its renameable
   * `key`), and lives in plaintext frontmatter — it is an opaque handle, not
   * sensitive, so the board can build the hierarchy while the vault is locked.
   */
  parentId?: string;
  path: string;
  title: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee: string | null;
  labels: string[];
  linkedNotes: string[];
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  createdBy: string | null;
  /**
   * True when this ticket is end-to-end encrypted at
   * `tickets/<id>.md.age`. Status, priority, and dueDate stay in
   * plaintext frontmatter so the board renders correctly even when
   * locked; title, body, assignee, and labels live inside the
   * ciphertext.
   */
  encrypted?: boolean;
}
