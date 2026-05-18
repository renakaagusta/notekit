import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import type { Ticket, TicketPriority, TicketStatus } from "../types/ticket";
import {
  type BoardFilters,
  type SavedView,
  activeFacetCount,
  isFiltersEmpty,
} from "../lib/board-filters";
import { useMembersStore } from "../stores/membersStore";
import { resolveAssignee } from "../lib/members";

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
];

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: "urgent", label: "P0 · Urgent" },
  { value: "high", label: "P1 · High" },
  { value: "medium", label: "P2 · Medium" },
  { value: "low", label: "P3 · Low" },
];

interface ViewTab {
  id: string;
  name: string;
  builtin: boolean;
}

interface BoardToolbarProps {
  filters: BoardFilters;
  onFiltersChange(next: BoardFilters): void;
  tickets: Ticket[];

  activeViewId: string;
  onActiveViewChange(id: string): void;
  views: ViewTab[];

  savedViews: SavedView[];
  onSaveCurrent(name: string): void;
  onDeleteSavedView(id: string): void;
}

export function BoardToolbar({
  filters,
  onFiltersChange,
  tickets,
  activeViewId,
  onActiveViewChange,
  views,
  savedViews,
  onSaveCurrent,
  onDeleteSavedView,
}: BoardToolbarProps) {
  const members = useMembersStore((s) => s.members);

  // Derive label + assignee options from current ticket data so the dropdowns
  // always reflect what's actually in the vault.
  const labelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tickets) for (const l of t.labels) set.add(l);
    return [...set].sort();
  }, [tickets]);

  const assigneeOptions = useMemo(() => {
    const usedKeys = new Set<string>();
    for (const t of tickets) usedKeys.add(t.assignee?.trim() ?? "");
    const out: { value: string; label: string }[] = [];
    // Unassigned bucket is meaningful even without anyone assigned.
    out.push({ value: "", label: "Unassigned" });
    // Members from .notekit/members.json first.
    for (const m of members) {
      const key = `${m.kind}:${m.id}`;
      out.push({ value: key, label: m.name });
      usedKeys.delete(key);
    }
    usedKeys.delete("");
    // Then legacy or unknown assignees that aren't in members.json.
    for (const key of [...usedKeys].sort()) {
      const r = resolveAssignee(key, members);
      out.push({ value: key, label: r?.display ?? key });
    }
    return out;
  }, [tickets, members]);

  const facetCount = activeFacetCount(filters);
  const isClean = isFiltersEmpty(filters);

  function update<K extends keyof BoardFilters>(key: K, value: BoardFilters[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  function clear() {
    onFiltersChange({ statuses: [], priorities: [], assignees: [], labels: [] });
  }

  return (
    <div className="nk-board-toolbar">
      <div className="nk-view-tabs" role="tablist">
        {views.map((v) => (
          <ViewTabButton
            key={v.id}
            tab={v}
            active={v.id === activeViewId}
            onClick={() => onActiveViewChange(v.id)}
            onDelete={
              v.builtin ? undefined : () => onDeleteSavedView(v.id)
            }
          />
        ))}
        <SaveViewButton
          disabled={isClean}
          existingNames={savedViews.map((v) => v.name)}
          onSave={onSaveCurrent}
        />
      </div>

      <div className="nk-filter-chips">
        <FilterChip
          label="Status"
          count={filters.statuses.length}
          options={STATUS_OPTIONS}
          selected={filters.statuses}
          onChange={(next) => update("statuses", next as TicketStatus[])}
        />
        <FilterChip
          label="Priority"
          count={filters.priorities.length}
          options={PRIORITY_OPTIONS}
          selected={filters.priorities}
          onChange={(next) => update("priorities", next as TicketPriority[])}
        />
        <FilterChip
          label="Assignee"
          count={filters.assignees.length}
          options={assigneeOptions}
          selected={filters.assignees}
          onChange={(next) => update("assignees", next)}
          emptyHint="No assignees yet."
        />
        <FilterChip
          label="Label"
          count={filters.labels.length}
          options={labelOptions.map((l) => ({ value: l, label: l }))}
          selected={filters.labels}
          onChange={(next) => update("labels", next)}
          emptyHint="No labels yet."
        />

        {facetCount > 0 && (
          <button
            type="button"
            className="nk-filter-clear"
            onClick={clear}
            title="Clear all filters"
          >
            Clear · {facetCount}
          </button>
        )}
      </div>
    </div>
  );
}

interface ViewTabButtonProps {
  tab: ViewTab;
  active: boolean;
  onClick(): void;
  onDelete?: () => void;
}

function ViewTabButton({ tab, active, onClick, onDelete }: ViewTabButtonProps) {
  return (
    <div className={"nk-view-tab" + (active ? " is-active" : "")}>
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className="nk-view-tab-btn"
        onClick={onClick}
      >
        {tab.name}
      </button>
      {onDelete && (
        <button
          type="button"
          className="nk-view-tab-x"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete view "${tab.name}"?`)) onDelete();
          }}
          title={`Delete view "${tab.name}"`}
          aria-label={`Delete view "${tab.name}"`}
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}

interface SaveViewButtonProps {
  disabled: boolean;
  existingNames: string[];
  onSave(name: string): void;
}

function SaveViewButton({ disabled, existingNames, onSave }: SaveViewButtonProps) {
  return (
    <button
      type="button"
      className="nk-view-tab-btn nk-view-save"
      disabled={disabled}
      title={
        disabled
          ? "Add at least one filter to save a view"
          : "Save current filters as a view"
      }
      onClick={() => {
        const name = prompt("Name this view:");
        const trimmed = name?.trim();
        if (!trimmed) return;
        if (existingNames.includes(trimmed)) {
          alert(`A view named "${trimmed}" already exists.`);
          return;
        }
        onSave(trimmed);
      }}
    >
      <Plus size={12} aria-hidden />
      Save view
    </button>
  );
}

interface FilterChipProps<T extends string> {
  label: string;
  count: number;
  options: { value: T; label: string }[];
  selected: T[];
  onChange(next: T[]): void;
  emptyHint?: string;
}

function FilterChip<T extends string>({
  label,
  count,
  options,
  selected,
  onChange,
  emptyHint,
}: FilterChipProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: T) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div className="nk-filter" ref={wrapRef}>
      <button
        type="button"
        className={"nk-filter-trigger" + (count > 0 ? " has-value" : "")}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {count > 0 && <span className="nk-filter-badge">{count}</span>}
        <ChevronDown size={12} className="nk-filter-caret" aria-hidden />
      </button>

      {open && (
        <div className="nk-filter-pop">
          {options.length === 0 && (
            <p className="nk-empty-hint">{emptyHint ?? "No options."}</p>
          )}
          {options.map((opt) => {
            const isOn = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={"nk-filter-row" + (isOn ? " is-selected" : "")}
              >
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggle(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
          {count > 0 && (
            <button
              type="button"
              className="nk-assignee-clear"
              onClick={() => onChange([])}
            >
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
