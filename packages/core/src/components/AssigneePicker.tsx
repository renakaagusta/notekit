import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useMembersStore } from "../stores/membersStore";
import { SkeletonCommitList } from "./Skeleton";
import {
  MEMBERS_PATH,
  assigneeStringOf,
  resolveAssignee,
} from "../lib/members";
import type { Member, MemberKind } from "../types/member";

interface AssigneePickerProps {
  value: string | null;
  onChange(next: string | null): void;
  /** Compact in-card trigger vs. full-width pill. */
  variant?: "card" | "inline";
}

export function AssigneePicker({
  value,
  onChange,
  variant = "card",
}: AssigneePickerProps) {
  const status = useMembersStore((s) => s.status);
  const members = useMembersStore((s) => s.members);
  const load = useMembersStore((s) => s.load);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lazy-load members the first time the picker is opened in a session.
  useEffect(() => {
    if (open && status === "idle") void load();
  }, [open, status, load]);

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

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery("");
  }, [open]);

  const resolved = useMemo(() => resolveAssignee(value, members), [value, members]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
  }, [members, query]);

  function pick(m: Member) {
    onChange(assigneeStringOf(m));
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setOpen(false);
  }

  return (
    <div className="nk-assignee" ref={wrapRef}>
      <button
        type="button"
        className={
          "nk-assignee-trigger" +
          (variant === "inline" ? " nk-assignee-trigger--inline" : "") +
          (resolved ? " has-value" : "")
        }
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={resolved ? `Assigned to ${resolved.display}` : "Assign"}
        aria-label={resolved ? `Assigned to ${resolved.display}` : "Assign"}
      >
        {resolved ? (
          <>
            <Avatar member={resolved} />
            {variant === "inline" && (
              <span className="nk-assignee-name">{resolved.display}</span>
            )}
          </>
        ) : (
          <>
            <Plus size={12} className="nk-assignee-empty" aria-hidden />
            {variant === "inline" && (
              <span className="nk-assignee-name nk-assignee-name--muted">
                Assign
              </span>
            )}
          </>
        )}
      </button>

      {open && (
        <div className="nk-assignee-pop" onMouseDown={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            className="nk-input nk-assignee-search"
            placeholder="Search people or agents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="nk-assignee-list">
            {status === "loading" && <SkeletonCommitList count={3} />}
            {status === "error" && (
              <p className="nk-empty-hint">
                Couldn't load members. Try again later.
              </p>
            )}
            {(status === "ready" || status === "missing") && filtered.length === 0 && (
              <p className="nk-empty-hint">
                {status === "missing" ? (
                  <>
                    No <code>{MEMBERS_PATH}</code> in this vault yet. Add one
                    with{" "}
                    <code>
                      {`{ "users": [...], "agents": [...] }`}
                    </code>
                    .
                  </>
                ) : (
                  "No matches."
                )}
              </p>
            )}
            {filtered.length > 0 && (
              <Section
                title="People"
                kind="user"
                items={filtered.filter((m) => m.kind === "user")}
                onPick={pick}
                selectedId={resolved?.kind === "user" ? resolved.id : null}
              />
            )}
            {filtered.length > 0 && (
              <Section
                title="Agents"
                kind="agent"
                items={filtered.filter((m) => m.kind === "agent")}
                onPick={pick}
                selectedId={resolved?.kind === "agent" ? resolved.id : null}
              />
            )}
          </div>
          {resolved && (
            <button
              type="button"
              className="nk-assignee-clear"
              onClick={clear}
            >
              Unassign
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  kind: MemberKind;
  items: Member[];
  selectedId: string | null;
  onPick(m: Member): void;
}

function Section({ title, items, onPick, selectedId }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <div className="nk-assignee-section">
      <div className="nk-assignee-section-title">{title}</div>
      <ul>
        {items.map((m) => (
          <li key={`${m.kind}:${m.id}`}>
            <button
              type="button"
              className={
                "nk-assignee-row" + (selectedId === m.id ? " is-selected" : "")
              }
              onClick={() => onPick(m)}
            >
              <Avatar member={m} />
              <span className="nk-assignee-name">{m.name}</span>
              {m.kind === "agent" && (
                <span className="nk-chip nk-assignee-kind">agent</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface AvatarProps {
  member: { kind: MemberKind | "legacy"; display?: string; name?: string; id: string };
}

function Avatar({ member }: AvatarProps) {
  const label = "display" in member && member.display ? member.display : member.name ?? member.id;
  const initial = label.slice(0, 1).toUpperCase();
  const cls =
    "nk-assignee-avatar" +
    (member.kind === "agent" ? " is-agent" : "") +
    (member.kind === "legacy" ? " is-legacy" : "");
  return (
    <span className={cls} aria-hidden>
      {initial}
    </span>
  );
}
