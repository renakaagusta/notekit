export type RailPanel = "history" | "secrets";

interface RailProps {
  active?: RailPanel | null;
  onToggle?(panel: RailPanel): void;
}

export function Rail({ active = null, onToggle }: RailProps) {
  return (
    <aside className="nk-rail" aria-label="Right rail">
      <button
        className={"nk-rail-btn" + (active === "history" ? " active" : "")}
        title="Note history"
        onClick={() => onToggle?.("history")}
        aria-label="Note history"
      >
        <ClockIcon />
      </button>
      <button
        className={"nk-rail-btn" + (active === "secrets" ? " active" : "")}
        title="Secrets"
        onClick={() => onToggle?.("secrets")}
        aria-label="Secrets"
      >
        <KeyIcon />
      </button>
      <div className="nk-rail-divider" aria-hidden />
    </aside>
  );
}

function KeyIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      width="14"
      height="14"
      aria-hidden
    >
      <path
        d="M8 1.5L2.5 3.5v4C2.5 10.5 5 13 8 14.5 11 13 13.5 10.5 13.5 7.5v-4L8 1.5Z"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      width="14"
      height="14"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.2 1.5" strokeLinecap="round" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 1.5l1.4 3.7L13 6.6l-3.6 1.4L8 11.7 6.6 8 3 6.6l3.6-1.4L8 1.5zM12.5 11l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6z" />
    </svg>
  );
}


