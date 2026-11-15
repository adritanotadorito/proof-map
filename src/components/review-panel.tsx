import Link from "next/link";
import type { Routing } from "@/lib/review/routing";
import { ROUTE_LABEL, type CheckedCitation, type ReviewRecord, type Support } from "@/lib/review/types";

/**
 * Four kinds of statement appear in a review, and each keeps its own colour everywhere:
 * AI claim (purple), source evidence (teal), executed check (green), human decision (blue).
 */
export function KindLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" data-testid="legend">
      <span className="pill pill-done">AI claim</span> what the model says
      <span className="pill pill-brand">Source evidence</span> found in the pinned snapshot
      <span className="pill pill-success">Executed check</span> something that was run
      <span className="pill pill-accent">Human decision</span> a named person
    </p>
  );
}

export function citationHref(c: CheckedCitation): string {
  if (c.sourceType === "requirement" || !c.path || c.lineStart === null || c.lineEnd === null) {
    return "/change?tab=requirement#issue-text";
  }
  return `/change/source?path=${encodeURIComponent(c.path)}&start=${c.lineStart}&end=${c.lineEnd}#L${c.lineStart}`;
}

const sourceWord = { requirement: "Requirement text", source: "Pinned file", diff: "Pinned diff" } as const;

function Citation({ c }: { c: CheckedCitation }) {
  const where =
    c.sourceType === "requirement"
      ? "requirement"
      : `${c.path}:${c.lineStart}${c.lineEnd !== c.lineStart ? `-${c.lineEnd}` : ""}`;
  return (
    <li className="min-w-0 text-xs">
      {c.valid ? (
        <>
          <span className="pill pill-brand">{sourceWord[c.sourceType]}</span>{" "}
          <Link href={citationHref(c)} className="link break-all font-mono">
            {where}
          </Link>
        </>
      ) : (
        <>
          <span className="pill pill-danger">citation rejected</span>{" "}
          <span className="break-all font-mono line-through decoration-danger">{where}</span>{" "}
          <span className="text-muted">{c.problem}</span>
        </>
      )}
      <code className="mt-1 block truncate rounded bg-surface px-2 py-0.5 font-mono text-[11px] text-muted">{c.quote}</code>
    </li>
  );
}

function SupportPill({ support }: { support: Support }) {
  return support === "cited" ? (
    <span className="pill pill-brand" title="Every citation was found in the pinned snapshot. This shows the cited text exists, not that the statement is true.">
      citations found
    </span>
  ) : (
    <span className="pill pill-danger" title="At least one citation could not be found where the model said it was.">
      unsupported
    </span>
  );
}

const NotExecuted = () => (
  <span className="pill pill-pending" title="No build, test or fault probe was run for this statement.">
    no executed check
  </span>
);

const coverageWord = {
  addresses: "addresses",
  "partially-addresses": "partially addresses",
  "does-not-address": "does not address",
  unclear: "unclear",
} as const;
const coverageTone = { addresses: "", "partially-addresses": "pill-attention", "does-not-address": "pill-danger", unclear: "pill-attention" } as const;
const severityTone = { high: "pill-danger", medium: "pill-attention", low: "" } as const;

const itemBox = "min-w-0 rounded-md border border-line px-4 py-3";

/** The two-sentence briefing (what changed, next step), then one more sentence of detail. */
export function ReviewLead({ review, stale, requirementChanged }: { review: ReviewRecord; stale: boolean; requirementChanged: boolean }) {
  return (
    <div data-testid="lead">
      {stale && (
        <p role="alert" className="border-b border-line bg-attention/10 px-4 py-2.5 text-[13px]">
          <span className="pill pill-attention">stale</span> This review describes commit{" "}
          <span className="font-mono">{review.headSha.slice(0, 10)}</span>, which is no longer the branch head. It does
          not cover the new head.
        </p>
      )}
      {requirementChanged && (
        <p role="alert" className="border-b border-line bg-attention/10 px-4 py-2.5 text-[13px]">
          This review was made against requirement <span className="font-mono">{review.requirement.id}</span>, which is
          not the requirement linked now. Review again.
        </p>
      )}
      <div className="px-4 py-4">
        {/* The briefing is two sentences: what changed, then the next step. Everything else sits below it. */}
        <div className="grid gap-2 text-base leading-7">
          <p>
            <span className="eyebrow mr-2">What changed</span>
            <span data-testid="lead-1">{review.explanation[0]}</span>
          </p>
          <p>
            <span className="eyebrow mr-2">Next step</span>
            <span className="font-medium" data-testid="next-action">
              {review.nextAction}
            </span>
          </p>
        </div>
        <p className="mt-3 text-[13px] text-muted">
          <span className="font-semibold">More detail:</span> <span data-testid="lead-2">{review.explanation[1]}</span>
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="pill pill-done">AI claim</span>
          <span>
            {review.model.versionReported ?? review.model.requested} · reviewed {review.createdAt.replace("T", " ").slice(0, 16)} UTC ·
            head <span className="font-mono">{review.headSha.slice(0, 10)}</span> · advice, not an approval · nothing was executed
          </span>
        </p>
      </div>
    </div>
  );
}

export function ReviewCoverage({ review }: { review: ReviewRecord }) {
  return (
    <ul className="grid grid-cols-1 gap-3 px-4 py-4" data-testid="coverage">
      {review.claims.length === 0 && <li className="text-sm text-muted">The model made no coverage claims.</li>}
      {review.claims.map((c) => (
        <li key={c.id} className={itemBox} data-claim={c.id}>
          <p className="text-sm font-medium">{c.statement}</p>
          <p className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="pill pill-done">AI claim</span>
            <span className={`pill ${coverageTone[c.coverage]}`}>{coverageWord[c.coverage]} the requirement</span>
            <SupportPill support={c.support} />
            <NotExecuted />
          </p>
          <p className="mt-2 text-[13px] text-muted">{c.reason}</p>
          <ul className="mt-2 grid grid-cols-1 gap-1.5">
            {c.citations.map((cit, i) => (
              <Citation key={i} c={cit} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function ReviewFindings({ review }: { review: ReviewRecord }) {
  if (review.findings.length === 0) {
    return (
      <p className="px-4 py-4 text-sm text-muted" data-testid="findings">
        The model reported no potential defects or risks. That is not evidence that there are none.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 px-4 py-4" data-testid="findings">
      {review.findings.map((f) => (
        <li key={f.id} className={itemBox}>
          <p className="text-sm font-medium">{f.title}</p>
          <p className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="pill pill-done">AI claim</span>
            <span className={`pill ${severityTone[f.severity]}`}>{f.severity} severity</span>
            <SupportPill support={f.support} />
            <NotExecuted />
          </p>
          <p className="mt-2 text-[13px] text-muted">{f.reason}</p>
          <p className="mt-1.5 text-[13px]">
            <span className="text-muted">Impact if real:</span> {f.impact}
          </p>
          <p className="mt-1 text-[13px]">
            <span className="text-muted">What to do:</span> {f.humanAction}
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-1.5">
            {f.citations.map((cit, i) => (
              <Citation key={i} c={cit} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function ReviewUnknowns({ review }: { review: ReviewRecord }) {
  return (
    <ul className="grid grid-cols-1 gap-3 px-4 py-4" data-testid="unknowns">
      {review.unknowns.map((u) => (
        <li key={u.question} className={`${itemBox} text-[13px]`}>
          <p className="text-sm font-medium">{u.question}</p>
          <p className="mt-1.5">
            <span className="text-muted">Why it cannot be established:</span> {u.whyUnresolved}
          </p>
          <p className="mt-1">
            <span className="text-muted">Next check needed:</span> {u.nextCheck}
          </p>
        </li>
      ))}
      {review.notChecked.map((n) => (
        <li key={n} className="flex items-start gap-2 text-[13px] text-muted">
          <span className="pill pill-pending shrink-0">not checked</span> {n}
        </li>
      ))}
    </ul>
  );
}

/** Why the change is routed where it is. Computed by rule from observable signals; no score. */
export function RoutingBox({ routing }: { routing: Routing }) {
  const tone = routing.route === "full-read" ? "pill-danger" : routing.route === "focused-review" ? "pill-attention" : "pill-success";
  return (
    <section className="box" data-testid="routing">
      <h2 className="box-head">
        <span>
          Suggested depth of human review <span className={`pill ${tone} ml-1`}>{ROUTE_LABEL[routing.route]}</span>
        </span>
        <span className="text-xs font-normal text-muted">rule-based · advice only</span>
      </h2>
      <div className="px-4 py-3 text-[13px]">
        {routing.drivers.length > 0 ? (
          <>
            <p className="text-muted">Routed to {ROUTE_LABEL[routing.route].toLowerCase()} because:</p>
            <ul className="mt-1 list-disc pl-5">
              {routing.drivers.map((s) => (
                <li key={s.key}>
                  <span className="font-medium">{s.label}:</span> {s.value}. <span className="text-muted">{s.why}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted">No signal asks for more than a light check.</p>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted">All {routing.signals.length} signals</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Signal</th>
                  <th className="py-1 pr-3 font-medium">Observed</th>
                  <th className="py-1 font-medium">Asks for</th>
                </tr>
              </thead>
              <tbody>
                {routing.signals.map((s) => (
                  <tr key={s.key} className="border-t border-line align-top">
                    <td className="py-1.5 pr-3 font-medium">{s.label}</td>
                    <td className="py-1.5 pr-3 text-muted">{s.value}</td>
                    <td className="py-1.5 whitespace-nowrap">{ROUTE_LABEL[s.asks]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <p className="mt-3 text-xs text-muted">
          There is no trust score: ProofMap has no track record yet. You can always read more than this suggests.
        </p>
      </div>
    </section>
  );
}

/** Checks actually performed, what the model was shown, and where the record came from. */
export function ReviewRecordDetails({ review }: { review: ReviewRecord }) {
  const rejected = [...review.claims.flatMap((c) => c.citations), ...review.findings.flatMap((f) => f.citations)].filter((c) => !c.valid);
  return (
    <div data-testid="record">
      <div className="px-4 py-4">
        <h3 className="text-sm font-semibold">Checks</h3>
        <ul className="mt-2 grid grid-cols-1 gap-2 text-[13px]">
          {review.checks.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start gap-2">
              <span className={`pill shrink-0 ${c.result === "pass" ? "pill-success" : c.result === "fail" ? "pill-danger" : "pill-pending"}`}>
                {c.type}: {c.result === "not-run" ? "not run" : c.result}
              </span>
              <span className="min-w-0 flex-1 text-muted">{c.detail}</span>
            </li>
          ))}
        </ul>
        {rejected.length > 0 && (
          <>
            <p className="mt-4 text-xs font-semibold text-danger">Rejected citations · {rejected.length}</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted">
              {rejected.map((c, i) => (
                <li key={i}>
                  <span className="font-mono">{c.path ? `${c.path}:${c.lineStart}-${c.lineEnd}` : "requirement"}</span>: {c.problem}
                </li>
              ))}
            </ul>
          </>
        )}
        {review.contextOmissions.length > 0 && (
          <>
            <p className="mt-4 text-xs font-semibold">Not shown to the model</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted">
              {review.contextOmissions.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </>
        )}
        {review.outcomeMentions.length > 0 && (
          <>
            <p className="mt-4 text-xs font-semibold text-attention">
              The model mentioned a test or build outcome. Nothing was run, so read these as intent, not results:
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted">
              {review.outcomeMentions.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="box-row px-4 py-4 text-xs text-muted">
        <h3 className="text-sm font-semibold text-foreground">Provenance</h3>
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[9rem_1fr]">
          <dt>Requested by</dt>
          <dd>
            @{review.requestedBy} at {review.createdAt}
          </dd>
          <dt>Base → head</dt>
          <dd className="break-all font-mono">
            {review.baseSha} → {review.headSha}
          </dd>
          <dt>Requirement</dt>
          <dd className="break-all font-mono">{review.requirement.id}</dd>
          <dt>Model</dt>
          <dd>
            requested <span className="font-mono">{review.model.requested}</span>, reported{" "}
            <span className="font-mono">{review.model.versionReported ?? "not reported"}</span>, {review.model.attempts} attempt
            {review.model.attempts === 1 ? "" : "s"}
          </dd>
          <dt>Prompt size</dt>
          <dd>
            {review.model.promptChars.toLocaleString("en")} characters
            {review.model.usage?.totalTokenCount ? ` · ${review.model.usage.totalTokenCount.toLocaleString("en")} tokens total` : ""}
          </dd>
          <dt>Response SHA-256</dt>
          <dd className="break-all font-mono">{review.model.responseSha256}</dd>
        </dl>
        <details className="mt-3">
          <summary className="cursor-pointer">Context shown to the model · {review.contextSources.length}</summary>
          <ul className="mt-1 list-disc pl-5">
            {review.contextSources.map((s, i) => (
              <li key={i}>
                {s.kind}
                {s.path ? <span className="break-all font-mono"> {s.path}</span> : null}
                {s.lineStart !== null ? ` lines ${s.lineStart}-${s.lineEnd}` : ""}
                {s.note ? ` (${s.note})` : ""}
              </li>
            ))}
          </ul>
        </details>
        <details className="mt-2">
          <summary className="cursor-pointer">Events · {review.events.length}</summary>
          <ul className="mt-1 list-disc pl-5">
            {review.events.map((e, i) => (
              <li key={i}>
                <span className="font-mono">{e.at}</span> · {e.actor} · {e.detail}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
