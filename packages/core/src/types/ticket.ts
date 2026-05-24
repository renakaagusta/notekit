export type TicketStatus = "todo" | "in_progress" | "blocked" | "done" | "archived";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface Ticket {
  id: string;
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
