import type { Ticket, TicketPriority, TicketStatus } from "../types/ticket";
import { buildWeekGrid, localeFirstWeekday, todayYMD } from "./journal";

/**
 * Filter facets work like Linear: multi-select within a facet (OR), AND across
 * facets. Empty arrays mean "no filter applied to this facet."
 *
 * `assignees` uses the canonical assignee string (`user:<id>` / `agent:<id>`),
 * with the empty string `""` representing the "Unassigned" bucket.
 */
export interface BoardFilters {
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  assignees: string[];
  labels: string[];
}

export const EMPTY_FILTERS: BoardFilters = {
  statuses: [],
  priorities: [],
  assignees: [],
  labels: [],
};

export function isFiltersEmpty(f: BoardFilters): boolean {
  return (
    f.statuses.length === 0 &&
    f.priorities.length === 0 &&
    f.assignees.length === 0 &&
    f.labels.length === 0
  );
}

export function activeFacetCount(f: BoardFilters): number {
  return (
    f.statuses.length +
    f.priorities.length +
    f.assignees.length +
    f.labels.length
  );
}

export function matchTicket(t: Ticket, f: BoardFilters): boolean {
  if (f.statuses.length > 0 && !f.statuses.includes(t.status)) return false;
  if (f.priorities.length > 0 && !f.priorities.includes(t.priority)) return false;
  if (f.assignees.length > 0) {
    const key = t.assignee?.trim() ?? "";
    if (!f.assignees.includes(key)) return false;
  }
  if (f.labels.length > 0) {
    if (!f.labels.some((l) => t.labels.includes(l))) return false;
  }
  return true;
}

/**
 * Built-in views. `Mine` needs a current-user identity passed in at runtime
 * because the user's id lives outside this module (vault owner or explicit
 * override).
 */
export interface BoardView {
  id: string;
  name: string;
  builtin: true;
  /** Resolve to a concrete BoardFilters given runtime context. */
  resolve(ctx: ViewContext): BoardFilters;
}

export interface ViewContext {
  /** Canonical assignee string for "me", e.g. `user:rena`. Falsy disables Mine. */
  currentUser: string | null;
  /** All tickets (used by views that need to inspect data, e.g. Due this week). */
  tickets: Ticket[];
}

export const BUILTIN_VIEWS: BoardView[] = [
  {
    id: "all",
    name: "All",
    builtin: true,
    resolve: () => EMPTY_FILTERS,
  },
  {
    id: "mine",
    name: "Mine",
    builtin: true,
    resolve: ({ currentUser }) => ({
      ...EMPTY_FILTERS,
      assignees: currentUser ? [currentUser] : [],
    }),
  },
  {
    id: "urgent",
    name: "Urgent",
    builtin: true,
    resolve: () => ({
      ...EMPTY_FILTERS,
      priorities: ["urgent"],
      statuses: ["todo", "in_progress", "blocked"],
    }),
  },
  {
    id: "due_week",
    name: "Due this week",
    builtin: true,
    resolve: ({ tickets }) => {
      const week = currentWeekRange();
      const assignees: string[] = [];
      // Due-this-week is implemented at the matcher boundary as a status filter
      // (open tickets) plus a label-side filter via dueDate. Since BoardFilters
      // doesn't include a date range yet, we encode this preset directly by
      // collapsing to a label-free check and let the board apply dueDate range
      // separately via `matchExtraDueRange`.
      void assignees;
      return {
        ...EMPTY_FILTERS,
        statuses: ["todo", "in_progress", "blocked"],
        // marker for caller; see `viewDueRange` below
      } satisfies BoardFilters;
    },
  },
];

/** Returns [startYMD, endYMD] (inclusive) for the current locale week. */
export function currentWeekRange(): [string, string] {
  const today = todayYMD();
  const week = buildWeekGrid(today, localeFirstWeekday());
  const first = week[0]?.ymd ?? today;
  const last = week[6]?.ymd ?? today;
  return [first, last];
}

/** Date-range overlay for the "Due this week" preset. Null = no date filter. */
export function viewDueRange(viewId: string): [string, string] | null {
  return viewId === "due_week" ? currentWeekRange() : null;
}

export function matchDueRange(t: Ticket, range: [string, string] | null): boolean {
  if (!range) return true;
  if (!t.dueDate) return false;
  return t.dueDate >= range[0] && t.dueDate <= range[1];
}

// ─── Persistence ───────────────────────────────────────────────────

const FILTERS_KEY = "notekit:board:filters";
const SAVED_VIEWS_KEY = "notekit:board:savedViews";
const ACTIVE_VIEW_KEY = "notekit:board:activeView";

export interface SavedView {
  id: string;
  name: string;
  filters: BoardFilters;
}

export function loadFilters(): BoardFilters {
  if (typeof localStorage === "undefined") return EMPTY_FILTERS;
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw) as Partial<BoardFilters>;
    return {
      statuses: arrayOf(parsed.statuses) as TicketStatus[],
      priorities: arrayOf(parsed.priorities) as TicketPriority[],
      assignees: arrayOf(parsed.assignees) as string[],
      labels: arrayOf(parsed.labels) as string[],
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

export function saveFilters(f: BoardFilters): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
}

export function loadSavedViews(): SavedView[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((v) => {
        if (!v || typeof v !== "object") return null;
        const obj = v as Record<string, unknown>;
        const id = String(obj.id ?? "").trim();
        const name = String(obj.name ?? "").trim();
        if (!id || !name) return null;
        const filters = obj.filters as Partial<BoardFilters> | undefined;
        return {
          id,
          name,
          filters: {
            statuses: arrayOf(filters?.statuses) as TicketStatus[],
            priorities: arrayOf(filters?.priorities) as TicketPriority[],
            assignees: arrayOf(filters?.assignees) as string[],
            labels: arrayOf(filters?.labels) as string[],
          },
        } satisfies SavedView;
      })
      .filter((v): v is SavedView => v !== null);
  } catch {
    return [];
  }
}

export function saveSavedViews(views: SavedView[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
}

export function loadActiveView(): string {
  if (typeof localStorage === "undefined") return "all";
  return localStorage.getItem(ACTIVE_VIEW_KEY) ?? "all";
}

export function saveActiveView(id: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACTIVE_VIEW_KEY, id);
}

function arrayOf(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}
