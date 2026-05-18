import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  appendSubtask,
  parseSubtasks,
  toggleSubtaskAt,
} from "../lib/subtasks";

interface SubtaskListProps {
  body: string;
  onChange(nextBody: string): void;
}

const COLLAPSED_LIMIT = 4;

export function SubtaskList({ body, onChange }: SubtaskListProps) {
  const subs = useMemo(() => parseSubtasks(body), [body]);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const visible = expanded || subs.length <= COLLAPSED_LIMIT
    ? subs
    : subs.slice(0, COLLAPSED_LIMIT);
  const overflow = subs.length - visible.length;

  function toggle(line: number, next: boolean) {
    onChange(toggleSubtaskAt(body, line, next));
  }

  function commitDraft() {
    const text = draft.trim();
    if (text) onChange(appendSubtask(body, text));
    setDraft("");
    setAdding(false);
  }

  if (subs.length === 0 && !adding) {
    return (
      <button
        type="button"
        className="nk-subtask-add nk-subtask-add--empty"
        onClick={(e) => {
          e.stopPropagation();
          setAdding(true);
        }}
        title="Add subtask"
      >
        <Plus size={11} aria-hidden /> subtask
      </button>
    );
  }

  return (
    <div className="nk-subtasks" onClick={(e) => e.stopPropagation()}>
      <ul className="nk-subtask-list">
        {visible.map((s) => (
          <li key={s.line} className={s.checked ? "is-done" : ""}>
            <label>
              <input
                type="checkbox"
                checked={s.checked}
                onChange={(e) => toggle(s.line, e.target.checked)}
              />
              <span>{s.text}</span>
            </label>
          </li>
        ))}
      </ul>

      {overflow > 0 && !expanded && (
        <button
          type="button"
          className="nk-subtask-more"
          onClick={() => setExpanded(true)}
        >
          <Plus size={11} aria-hidden /> {overflow} more
        </button>
      )}

      {adding ? (
        <div className="nk-subtask-input">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              } else if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            onBlur={commitDraft}
            placeholder="New subtask"
          />
        </div>
      ) : (
        <button
          type="button"
          className="nk-subtask-add"
          onClick={() => setAdding(true)}
        >
          <Plus size={11} aria-hidden /> subtask
        </button>
      )}
    </div>
  );
}
