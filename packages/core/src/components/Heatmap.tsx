import { useEffect, useMemo, useState } from "react";
import { listCommits, type VaultCommit } from "../lib/vault-api";
import { Skeleton } from "./Skeleton";

const DAYS_BACK = 364; // 52 weeks * 7 = 364, plus today = 365 cells
const COMMITS_LIMIT = 500;

interface HeatmapProps {
  /** Fired when the user clicks a day. The day pane shows commits + tickets due. */
  onSelectDay?: (ymd: string) => void;
  /** Currently selected day, if any (highlighted). */
  selectedYmd?: string | null;
}

interface BucketedCommits {
  byDay: Map<string, VaultCommit[]>;
  maxPerDay: number;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? "0" : ""}${m}-${day < 10 ? "0" : ""}${day}`;
}

export function Heatmap({ onSelectDay, selectedYmd }: HeatmapProps) {
  const [commits, setCommits] = useState<VaultCommit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listCommits(undefined, COMMITS_LIMIT);
        if (!cancelled) setCommits(res.commits);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bucketed: BucketedCommits | null = useMemo(() => {
    if (!commits) return null;
    const byDay = new Map<string, VaultCommit[]>();
    let max = 0;
    for (const c of commits) {
      const d = new Date(c.authoredAt);
      if (Number.isNaN(d.getTime())) continue;
      const ymd = ymdLocal(d);
      const list = byDay.get(ymd) ?? [];
      list.push(c);
      byDay.set(ymd, list);
      if (list.length > max) max = list.length;
    }
    return { byDay, maxPerDay: max };
  }, [commits]);

  const { weeks, monthMarkers } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Roll back so the grid ends on this week's Saturday-ish: easier to read
    // as "the last full year." Start: 52 weeks ago aligned to Sunday.
    const startOffset = 52 * 7 + today.getDay();
    const origin = new Date(today);
    origin.setDate(today.getDate() - startOffset + 1);

    const weeks: { ymd: string; date: Date; future: boolean }[][] = [];
    const monthMarkers: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;
    const fmtMonth = new Intl.DateTimeFormat(undefined, { month: "short" });

    for (let w = 0; w < 53; w++) {
      const week: { ymd: string; date: Date; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(
          origin.getFullYear(),
          origin.getMonth(),
          origin.getDate() + w * 7 + d,
        );
        const ymd = ymdLocal(date);
        const future = date.getTime() > today.getTime();
        week.push({ ymd, date, future });
        if (d === 0 && date.getMonth() !== lastMonth) {
          monthMarkers.push({ weekIndex: w, label: fmtMonth.format(date) });
          lastMonth = date.getMonth();
        }
      }
      weeks.push(week);
    }
    return { weeks, monthMarkers };
  }, []);

  function intensity(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count === 0) return 0;
    if (!bucketed || bucketed.maxPerDay <= 1) return count > 0 ? 2 : 0;
    const ratio = count / bucketed.maxPerDay;
    if (ratio < 0.25) return 1;
    if (ratio < 0.5) return 2;
    if (ratio < 0.75) return 3;
    return 4;
  }

  const totalCommits = commits?.length ?? 0;
  const totalDays = bucketed?.byDay.size ?? 0;

  return (
    <section className="nk-heatmap">
      <header className="nk-heatmap-hd">
        <div>
          <h3 className="nk-calendar-section-title">Activity</h3>
          <p className="nk-heatmap-sub">
            {commits === null && !error && (
              <Skeleton width={180} height={12} />
            )}
            {error && <span className="nk-heatmap-err">Couldn't load: {error}</span>}
            {commits && totalCommits > 0 && (
              <>
                <b>{totalCommits}</b> commit{totalCommits === 1 ? "" : "s"} across{" "}
                <b>{totalDays}</b> day{totalDays === 1 ? "" : "s"} (last year)
              </>
            )}
            {commits && totalCommits === 0 && (
              <span>No commits yet — start editing notes to see activity.</span>
            )}
          </p>
        </div>
        <div className="nk-heatmap-legend">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((lvl) => (
            <span key={lvl} className={`nk-heatmap-swatch level-${lvl}`} aria-hidden />
          ))}
          <span>More</span>
        </div>
      </header>

      <div className="nk-heatmap-grid-wrap">
        <div className="nk-heatmap-months" aria-hidden>
          {monthMarkers.map((m) => (
            <span
              key={`${m.weekIndex}-${m.label}`}
              className="nk-heatmap-month"
              style={{ gridColumnStart: m.weekIndex + 1 }}
            >
              {m.label}
            </span>
          ))}
        </div>
        <div className="nk-heatmap-grid" role="grid" aria-label="Activity heatmap">
          {weeks.map((week, wi) => (
            <div key={wi} className="nk-heatmap-week" role="row">
              {week.map((cell) => {
                const count = bucketed?.byDay.get(cell.ymd)?.length ?? 0;
                const lvl = cell.future ? 0 : intensity(count);
                const selected = selectedYmd === cell.ymd;
                return (
                  <button
                    key={cell.ymd}
                    type="button"
                    role="gridcell"
                    className={
                      "nk-heatmap-cell" +
                      ` level-${lvl}` +
                      (cell.future ? " future" : "") +
                      (selected ? " selected" : "")
                    }
                    disabled={cell.future}
                    onClick={() => onSelectDay?.(cell.ymd)}
                    title={`${cell.ymd}: ${count} commit${count === 1 ? "" : "s"}`}
                    aria-label={`${cell.ymd}, ${count} commits`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
