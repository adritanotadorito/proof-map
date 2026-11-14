export type TimelineItem = {
  key: string;
  /** "done" happened and has a record; "failed" was attempted without a result; "pending" has not happened. */
  state: "done" | "failed" | "pending";
  title: string;
  detail: string;
  /** Who or what produced the event. GitHub events are facts from GitHub; the rest are ProofMap's own. */
  source: "GitHub" | "ProofMap" | "Model" | "Human";
  actor?: string;
  /** ISO timestamp from the underlying record. Absent when no time was recorded: never made up. */
  at?: string;
  /** Shown in place of a time when none was recorded. */
  timeNote?: string;
  sha?: string;
  /** In-page section this event is evidence for. Only completed or failed events link. */
  href?: string;
};

const sourcePill: Record<TimelineItem["source"], string> = {
  GitHub: "pill",
  ProofMap: "pill pill-brand",
  Model: "pill pill-done",
  Human: "pill pill-accent",
};

function formatTime(iso: string): string {
  // Fixed UTC formatting so the server and browser always render the same text.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

function Marker({ state }: { state: TimelineItem["state"] }) {
  if (state === "done") {
    return (
      <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-background">
        ✓
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[11px] font-bold text-white">
        !
      </span>
    );
  }
  return <span aria-hidden className="h-5 w-5 rounded-full border-2 border-dashed border-line bg-background" />;
}

const stateWord = { done: "Completed", failed: "Attempted, no result", pending: "Pending" } as const;

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="px-4 py-4" data-testid="timeline">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        const pending = item.state === "pending";
        const body = (
          <>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`text-sm font-semibold ${pending ? "text-muted" : ""}`}>{item.title}</span>
              <span className={pending ? "pill pill-pending" : sourcePill[item.source]}>
                {pending ? "pending" : item.source}
              </span>
              <span className="sr-only">{stateWord[item.state]}.</span>
            </p>
            <p className={`mt-0.5 text-[13px] ${pending ? "text-muted/80" : "text-muted"}`}>{item.detail}</p>
            {!pending && (
              <p className="mt-0.5 font-mono text-[11px] text-muted">
                {item.at ? formatTime(item.at) : (item.timeNote ?? "no time recorded")}
                {item.actor ? ` · ${item.actor}` : ""}
                {item.sha ? ` · ${item.sha.slice(0, 10)}` : ""}
              </p>
            )}
          </>
        );
        return (
          <li key={item.key} className="flex gap-3" data-state={item.state}>
            <div className="flex flex-col items-center">
              <Marker state={item.state} />
              {!last && (
                <span
                  aria-hidden
                  className={`my-1 w-px flex-1 ${pending || items[i + 1].state === "pending" ? "border-l border-dashed border-line" : "bg-brand/50"}`}
                />
              )}
            </div>
            <div className={`min-w-0 flex-1 ${last ? "" : "pb-4"}`}>
              {item.href && !pending ? (
                <a href={item.href} className="-mx-2 -my-1 block rounded-md px-2 py-1 hover:bg-surface">
                  {body}
                </a>
              ) : (
                body
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
