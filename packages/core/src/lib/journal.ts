const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const JOURNAL_PATH_RE = /^journal\/(\d{4})\/(\d{2})\/(\d{2})(--[^/]+)?\.md$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function todayYMD(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function shiftYMD(ymd: string, days: number): string {
  const d = parseYMD(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + days);
  return todayYMD(d);
}

export function isValidYMD(s: string): boolean {
  const m = s.match(YMD_RE);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return (
    date.getFullYear() === Number(y) &&
    date.getMonth() === Number(mo) - 1 &&
    date.getDate() === Number(d)
  );
}

export function parseYMD(ymd: string): Date | null {
  const m = ymd.match(YMD_RE);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

export function journalPathFor(ymd: string): string {
  const m = ymd.match(YMD_RE);
  if (!m) throw new Error(`Invalid YMD: ${ymd}`);
  const [, y, mo, d] = m;
  return `journal/${y}/${mo}/${d}.md`;
}

export function dayNotePathFor(ymd: string, id: string): string {
  const m = ymd.match(YMD_RE);
  if (!m) throw new Error(`Invalid YMD: ${ymd}`);
  const [, y, mo, d] = m;
  return `journal/${y}/${mo}/${d}--${id}.md`;
}

export function journalYMDFromPath(path: string): string | null {
  const m = path.match(JOURNAL_PATH_RE);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo}-${d}`;
}

export function journalDefaultBody(ymd: string): string {
  return `# ${ymd}\n\n`;
}

// First day of the week per the user's OS locale. 1=Mon, 7=Sun (ISO).
// Falls back to Monday when the runtime lacks the weekInfo API.
export function localeFirstWeekday(): number {
  type WeekInfoLocale = Intl.Locale & { weekInfo?: { firstDay?: number } };
  try {
    const locale = new Intl.Locale(
      Intl.DateTimeFormat().resolvedOptions().locale,
    ) as WeekInfoLocale;
    const day = locale.weekInfo?.firstDay;
    if (typeof day === "number" && day >= 1 && day <= 7) return day;
  } catch {
    // ignore — fall through to default
  }
  return 1;
}

/** Convert ISO weekday (1=Mon..7=Sun) to JS weekday (0=Sun..6=Sat). */
function isoToJsDay(iso: number): number {
  return iso === 7 ? 0 : iso;
}

/** Format YMD from a Date object. */
function ymdFrom(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}`;
}

export interface GridCell {
  ymd: string;
  date: Date;
  inMonth: boolean;
  isToday: boolean;
}

/**
 * Build a 6×7 month grid that always starts on the locale's first weekday.
 * Cells outside the month are flagged via `inMonth: false` so the UI can dim them.
 */
export function buildMonthGrid(
  viewYear: number,
  viewMonth: number, // 0-indexed
  firstWeekday: number, // ISO 1..7
): GridCell[][] {
  const jsFirstDay = isoToJsDay(firstWeekday);
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const offset = (firstOfMonth.getDay() - jsFirstDay + 7) % 7;
  const start = new Date(viewYear, viewMonth, 1 - offset);
  const today = todayYMD();

  const grid: GridCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: GridCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + w * 7 + d,
      );
      const ymd = ymdFrom(date);
      week.push({
        ymd,
        date,
        inMonth: date.getMonth() === viewMonth,
        isToday: ymd === today,
      });
    }
    grid.push(week);
  }
  return grid;
}

/** The 7-day week containing `ymd`, starting on the locale's first weekday. */
export function buildWeekGrid(ymd: string, firstWeekday: number): GridCell[] {
  const target = parseYMD(ymd);
  if (!target) return [];
  const jsFirstDay = isoToJsDay(firstWeekday);
  const offset = (target.getDay() - jsFirstDay + 7) % 7;
  const start = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate() - offset,
  );
  const viewMonth = target.getMonth();
  const today = todayYMD();
  const week: GridCell[] = [];
  for (let d = 0; d < 7; d++) {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + d,
    );
    const ymdStr = ymdFrom(date);
    week.push({
      ymd: ymdStr,
      date,
      inMonth: date.getMonth() === viewMonth,
      isToday: ymdStr === today,
    });
  }
  return week;
}

/** Localized short weekday labels (e.g. ["Mon","Tue",…]) honoring `firstWeekday`. */
export function weekdayLabels(firstWeekday: number): string[] {
  const jsFirstDay = isoToJsDay(firstWeekday);
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  // 2024-01-07 is a Sunday — a stable reference point for any JS engine.
  const sunday = new Date(2024, 0, 7);
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2024, 0, sunday.getDate() + jsFirstDay + i);
    labels.push(formatter.format(d));
  }
  return labels;
}

/** Long month label like "May 2026". */
export function monthLabel(year: number, monthIdx: number): string {
  const d = new Date(year, monthIdx, 1);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(d);
}
