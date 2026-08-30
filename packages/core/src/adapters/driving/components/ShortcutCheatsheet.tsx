import { Modal } from "./Modal";

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

function ShortcutKey({ shortcut }: { shortcut: { keys: string[]; label: string } }) {
  return (
    <li>
      <span className="nk-cheat-keys">
        {shortcut.keys.map((key, index) => (
          <span key={key}>
            <kbd>{key}</kbd>
            {index < shortcut.keys.length - 1 && (
              <span className="nk-cheat-or"> or </span>
            )}
          </span>
        ))}
      </span>
      <span>{shortcut.label}</span>
    </li>
  );
}

export function ShortcutCheatsheet({ onClose }: ShortcutCheatsheetProps) {
  return (
    <Modal open title="Keyboard shortcuts" onClose={onClose}>
      <ul>
        {SHORTCUTS.map((shortcut) => (
          <ShortcutKey key={shortcut.label} shortcut={shortcut} />
        ))}
      </ul>
    </Modal>
  );
}
