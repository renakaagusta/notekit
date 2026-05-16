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
}
