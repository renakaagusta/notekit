import { CalendarDays, SquareKanban } from "lucide-react";
import { useState } from "react";
import { MOBILE_BREAKPOINT, useMediaQuery } from "../hooks/useMediaQuery";
import { CalendarView } from "./CalendarView";
import { MobileTasksView } from "./MobileTasksView";
import { TicketsBoard } from "./TicketsBoard";

type TasksMode = "kanban" | "calendar";

interface TasksViewProps {
  focusTicket?: { id: string; seq: number } | null;
  onOpenJournal?: (ymd: string) => void;
  userName?: string | null;
}

export function TasksView({ focusTicket, onOpenJournal, userName }: TasksViewProps) {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const [mode, setMode] = useState<TasksMode>(() =>
    (localStorage.getItem("nk:tasks-mode") as TasksMode | null) ?? "kanban",
  );

  // Phone gets a dedicated agenda screen (day strip + task cards); the Kanban
  // board and calendar are desktop-only surfaces.
  if (isMobile) {
    return <MobileTasksView userName={userName} focusTicket={focusTicket} />;
  }

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
