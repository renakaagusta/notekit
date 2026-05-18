import { useEffect } from "react";
import { X } from "lucide-react";

interface ShortcutCheatsheetProps {
  onClose(): void;
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["j", "↓"], label: "Move focus down" },
  { keys: ["k", "↑"], label: "Move focus up" },
  { keys: ["h", "←"], label: "Move focus left" },
  { keys: ["l", "→"], label: "Move focus right" },
  { keys: ["e", "Enter"], label: "Open ticket detail" },
  { keys: ["a"], label: "Open assignee picker" },
  { keys: ["."], label: "Open quick actions" },
  { keys: ["1"], label: "Move to Todo" },
  { keys: ["2"], label: "Move to In Progress" },
  { keys: ["3"], label: "Move to Blocked" },
  { keys: ["4"], label: "Move to Done" },
  { keys: ["5"], label: "Move to Archived" },
  { keys: ["?"], label: "Toggle this cheatsheet" },
  { keys: ["Esc"], label: "Close drawers / cheatsheet" },
];

export function ShortcutCheatsheet({ onClose }: ShortcutCheatsheetProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="nk-cheatsheet-backdrop" onClick={onClose}>
      <div
        className="nk-cheatsheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <header>
          <h3>Keyboard shortcuts</h3>
          <button
            className="nk-iconbtn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </button>
        </header>
        <ul>
          {SHORTCUTS.map((s) => (
            <li key={s.label}>
              <span className="nk-cheat-keys">
                {s.keys.map((k, i) => (
                  <span key={k}>
                    <kbd>{k}</kbd>
                    {i < s.keys.length - 1 && (
                      <span className="nk-cheat-or"> or </span>
                    )}
                  </span>
                ))}
              </span>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
