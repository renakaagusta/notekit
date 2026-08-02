import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { FileText } from "lucide-react";

export interface WikilinkItem {
  id: string;
  title: string;
}

interface Props {
  items: WikilinkItem[];
  command: (item: WikilinkItem) => void;
}

export interface WikilinkMenuHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}

export const WikilinkMenu = forwardRef<WikilinkMenuHandle, Props>(
  function WikilinkMenu({ items, command }, ref) {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown(event: KeyboardEvent) {
        if (event.key === "ArrowUp") {
          setSelected((s) => (s - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          const item = items[selected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (!items.length) return null;

    return (
      <div className="nk-slash-menu">
        {items.map((item, i) => (
          <button
            key={item.id}
            className={`nk-slash-item${i === selected ? " nk-slash-item--active" : ""}`}
            onMouseEnter={() => setSelected(i)}
            onClick={() => command(item)}
          >
            <FileText size={13} aria-hidden style={{ flexShrink: 0, opacity: 0.5 }} />
            <span className="nk-slash-title">{item.title}</span>
          </button>
        ))}
      </div>
    );
  },
);
