import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { SlashCommand } from "./extensions/SlashCommands";

interface Props {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
}

export interface SlashCommandMenuHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, Props>(
  function SlashCommandMenu({ items, command }, ref) {
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
            key={item.title}
            className={`nk-slash-item${i === selected ? " nk-slash-item--active" : ""}`}
            onMouseEnter={() => setSelected(i)}
            onClick={() => command(item)}
          >
            <span className="nk-slash-title">{item.title}</span>
            <span className="nk-slash-desc">{item.description}</span>
          </button>
        ))}
      </div>
    );
  },
);
