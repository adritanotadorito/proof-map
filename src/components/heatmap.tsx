/**
 * A year of activity, one square per UTC day, ending this week. Squares are coloured only from
 * the counts passed in: with no records every square is empty.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LEVELS = ["var(--line-muted)", "#0e4429", "#006d32", "#26a641", "#39d353"];
const WEEKS = 53;
const DAY = 86_400_000;

const level = (n: number) => (n <= 0 ? 0 : n >= 4 ? 4 : n);

export function heatmapStart(today: string): string {
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end.getTime() - (end.getUTCDay() + (WEEKS - 1) * 7) * DAY);
  return start.toISOString().slice(0, 10);
}

export function Heatmap({ days, today }: { days: Record<string, number>; today: string }) {
  const start = new Date(`${heatmapStart(today)}T00:00:00Z`).getTime();
  const weeks = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => new Date(start + (w * 7 + d) * DAY).toISOString().slice(0, 10)),
  );
  // A month is named above the first week that starts in it.
  const monthLabels = weeks.map((week, w) => {
    const month = Number(week[0].slice(5, 7)) - 1;
    const previous = w === 0 ? -1 : Number(weeks[w - 1][0].slice(5, 7)) - 1;
    return month !== previous ? MONTHS[month] : "";
  });
  const columns = { gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` };
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[640px] gap-2.5 text-xs">
        <div className="grid shrink-0 grid-rows-7 gap-[3px] pt-6 text-muted" aria-hidden>
          {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
            <span key={i} className="flex items-center leading-none">
              {d}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="grid h-6 gap-[3px] text-muted" style={columns} aria-hidden>
            {monthLabels.map((m, i) => (
              <span key={i} className="overflow-visible whitespace-nowrap">
                {m}
              </span>
            ))}
          </div>
          <div className="grid gap-[3px]" style={columns} role="img" aria-label="Activity by day over the last year">
            {weeks.map((week) => (
              <div key={week[0]} className="grid grid-rows-7 gap-[3px]">
                {week.map((day) => {
                  const n = days[day] ?? 0;
                  return day > today ? (
                    <span key={day} className="aspect-square" />
                  ) : (
                    <span
                      key={day}
                      className="aspect-square rounded-[3px]"
                      style={{ background: LEVELS[level(n)] }}
                      title={`${n === 0 ? "No records" : `${n} record${n === 1 ? "" : "s"}`} on ${day}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-1.5 text-muted">
            <span className="mr-1">Less</span>
            {LEVELS.map((c) => (
              <span key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />
            ))}
            <span className="ml-1">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Heading text for an activity panel, from real counts only. */
export function activitySummary(reviews: number, decisions: number): string {
  if (reviews + decisions === 0) return "No reviews or decisions recorded yet";
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${part(reviews, "AI review")} and ${part(decisions, "decision")} recorded in the last year`;
}
