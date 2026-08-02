import { useState } from "react";
import { CalendarDays, SquareKanban } from "lucide-react";
import { TicketsBoard } from "./TicketsBoard";
import { CalendarView } from "./CalendarView";

type TasksMode = "kanban" | "calendar";

interface TasksViewProps {
  focusTicket?: { id: string; seq: number } | null;
  onOpenJournal?: (ymd: string) => void;
}

export function TasksView({ focusTicket, onOpenJournal }: TasksViewProps) {
  const [mode, setMode] = useState<TasksMode>(() =>
    (localStorage.getItem("nk:tasks-mode") as TasksMode | null) ?? "kanban",
  );

  function switchMode(m: TasksMode) {
    setMode(m);
    localStorage.setItem("nk:tasks-mode", m);
  }

  const toggle = (
    <div className="nk-tasks-toggle">
      <button
        className={"nk-tasks-toggle-btn" + (mode === "kanban" ? " active" : "")}
        onClick={() => switchMode("kanban")}
        title="Board view"
        aria-pressed={mode === "kanban"}
      >
        <SquareKanban size={13} aria-hidden />
        <span>Board</span>
      </button>
      <button
        className={"nk-tasks-toggle-btn" + (mode === "calendar" ? " active" : "")}
        onClick={() => switchMode("calendar")}
        title="Calendar view"
        aria-pressed={mode === "calendar"}
      >
        <CalendarDays size={13} aria-hidden />
        <span>Calendar</span>
      </button>
    </div>
  );

  return (
    <div className="nk-tasks-view">
      {mode === "kanban" && (
        <TicketsBoard focusTicket={focusTicket} endSlot={toggle} />
      )}
      {mode === "calendar" && (
        <CalendarView
          onOpenJournal={onOpenJournal}
          focusTicket={focusTicket}
          endSlot={toggle}
        />
      )}
    </div>
  );
}
