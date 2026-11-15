import Link from "next/link";
import { pinTarget, recordDecision, resetManualRequirement, reviewChange, setManualRequirement } from "@/app/actions";
import { DiffView, type InlineNote } from "@/components/diff-view";
import {
  BotIcon,
  BranchIcon,
  CheckIcon,
  ChevronIcon,
  CommitIcon,
  DiffIcon,
  ExternalIcon,
  FailMark,
  FileIcon,
  NotRunMark,
  PassMark,
  OverviewIcon,
  PersonIcon,
  RequirementIcon,
  ReviewIcon,
} from "@/components/icons";
import {
  KindLegend,
  ReviewCoverage,
  ReviewFindings,
  ReviewLead,
  ReviewRecordDetails,
  ReviewUnknowns,
  RoutingBox,
  citationHref,
} from "@/components/review-panel";
import { DECISION_LABEL, NOTE_MAX, NOTE_MIN } from "@/lib/decision";
import { SubmitButton } from "@/components/submit-button";
import { Timeline } from "@/components/timeline";
import { Avatar } from "@/components/top-bar";
import { buildStages, buildTimeline, nextStep, stageSummary, type ChangeData, type Stage } from "@/lib/change-data";
import type { Comparison } from "@/lib/github";
import { parsePatch } from "@/lib/patch";
import { MAX_MANUAL_TEXT } from "@/lib/requirement";
import { requirementIdOf } from "@/lib/review/context";
import { ROUTE_LABEL, type CheckedCitation, type ReviewRecord } from "@/lib/review/types";
import type { PinnedTarget, SelectedRepo } from "@/lib/session";
import { DecisionBar } from "./decision-bar";
import { FileTree } from "./file-tree";
import { TabLink, TabPanel, TabsRoot } from "./tabs";

export const TABS = ["overview", "requirement", "commits", "files", "review", "decision"] as const;
export type Tab = (typeof TABS)[number];

/** Above this many files, diffs start collapsed. Above the second, patches are not rendered inline. */
const EXPAND_LIMIT = 12;
const INLINE_PATCH_LIMIT = 100;

const requirementErrors: Record<string, string> = {
  bad_reference: "That is not a GitHub issue link. Use https://github.com/owner/repo/issues/123 or owner/repo#123.",
  issue_not_found: "GitHub has no readable issue at that address (pull requests do not count). Nothing was saved.",
  too_long: `Requirement text is limited to ${MAX_MANUAL_TEXT} characters for now. Nothing was saved.`,
  empty: "Enter an issue link, or both a requirement ID and its text.",
};

const short = (sha: string) => sha.slice(0, 10);

function External({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className ?? "link"}>
      {children}
    </a>
  );
}

/** Proportional five-block bar for additions and deletions. */
function ChangeBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  const green = total === 0 ? 0 : Math.max(additions > 0 ? 1 : 0, Math.round((additions / total) * 5));
  const red = total === 0 ? 0 : Math.min(5 - green, Math.max(deletions > 0 ? 1 : 0, 5 - green));
  return (
    <span aria-hidden className="inline-flex gap-px align-middle">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-[1px] ${i < green ? "bg-success" : i < green + red ? "bg-danger" : "bg-line"}`}
        />
      ))}
    </span>
  );
}

function Stat({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="whitespace-nowrap font-mono text-xs">
      <span className="text-success">+{additions}</span> <span className="text-danger">−{deletions}</span>
    </span>
  );
}

function StageMarker({ state }: { state: Stage["state"] }) {
  if (state === "done") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-background">
        <CheckIcon className="h-2.5 w-2.5" />
      </span>
    );
  }
  if (state === "failed" || state === "action") {
    return (
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${state === "failed" ? "bg-danger" : "bg-attention"}`}
      >
        !
      </span>
    );
  }
  return <span className="h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-line" />;
}

const stageWord = { done: "done", failed: "failed", action: "needs you", pending: "pending" } as const;

const stateTone = { muted: "", success: "state-success", attention: "state-attention", danger: "state-danger", accent: "state-accent" } as const;
const decisionDot = { accept: "bg-success", "request-changes": "bg-danger", defer: "bg-attention" } as const;
const routeColor = { "light-check": "var(--success)", "focused-review": "var(--done)", "full-read": "var(--danger)" } as const;

const CHECK_TYPES = ["format", "citation", "build", "test", "fault-probe"] as const;
const checkName = { format: "format", citation: "citation", build: "build", test: "test", "fault-probe": "fault probe" } as const;

/**
 * Every check and whether it ran. A dashed ring means it did not run, and a build or test
 * shows as "Not run" until something actually executes it; a citation check never stands in for one.
 */
function ChecksBox({ review }: { review: ReviewRecord | null }) {
  const checks =
    review?.checks ??
    CHECK_TYPES.map((type) => ({
      id: type,
      type,
      result: "not-run" as const,
      detail: type === "format" || type === "citation" ? "No AI review has been run for this head." : "ProofMap has no runner for this yet.",
    }));
  const ran = checks.filter((c) => c.result !== "not-run").length;
  return (
    <details open className="box mx-4 mb-4 overflow-hidden" data-testid="checks">
      <summary className="box-head cursor-pointer">
        Checks
        <span className="text-xs font-normal text-muted">
          {ran} run · {checks.length - ran} not run
        </span>
      </summary>
      <ul>
        {checks.map((c) => (
          <li key={c.id} className="check-row first:border-t-0" data-check={c.type} data-result={c.result}>
            <span className="mt-0.5 shrink-0">{c.result === "pass" ? <PassMark /> : c.result === "fail" ? <FailMark /> : <NotRunMark />}</span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{checkName[c.type]}</span>{" "}
              <span className="text-muted">
                — {c.result === "not-run" ? "Not run" : c.type === "citation" ? c.detail : c.result === "pass" ? "Passed" : "Failed"}
              </span>
              <span className="block text-xs text-muted">
                {c.result === "not-run"
                  ? c.detail
                  : c.type === "citation"
                    ? "Each quoted line was looked up in the pinned snapshot. Shows the text exists, not that the code works."
                    : c.type === "format"
                      ? "The model's answer had the required structure. Says nothing about the code."
                      : c.detail}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted">{c.result === "not-run" ? "—" : "by ProofMap"}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

const lineLabel = (c: CheckedCitation) => (c.lineStart === c.lineEnd ? `line ${c.lineStart}` : `lines ${c.lineStart}–${c.lineEnd}`);

/** One AI statement, shown under the last displayed line of a citation that was found there. */
function InlineStatement({
  text,
  detail,
  action,
  tag,
  tagTone,
  citation,
  first,
  reviewer,
}: {
  text: string;
  detail: string;
  action: string | null;
  tag: string;
  tagTone: string;
  citation: CheckedCitation;
  first: boolean;
  reviewer: string;
}) {
  return (
    <div className="flex gap-3 px-3 py-3 sm:px-4">
      <span className="avatar hidden h-8 w-8 text-done sm:flex">
        <BotIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span className="font-semibold">ProofMap reviewer</span>
          <span className="pill">AI</span>
          <span className="text-muted">{reviewer}</span>
          <span className={`pill sm:ml-auto ${tagTone}`}>{tag}</span>
        </p>
        {first ? (
          <>
            <p className="mt-1.5 text-sm">{text}</p>
            <p className="mt-1 text-[13px] text-muted">{detail}</p>
            {action && (
              <p className="mt-1 text-[13px]">
                <span className="text-muted">What to do:</span> {action}
              </p>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-[13px] text-muted">
            The same statement also cites these lines: “{text.length > 140 ? `${text.slice(0, 140)}…` : text}”
          </p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          Cited:
          <Link href={citationHref(citation)} className="chip">
            {lineLabel(citation)}
          </Link>
          <span className="pill pill-brand">citation found in pinned head</span>
          <span className="pill pill-pending">no executed check</span>
        </p>
      </div>
    </div>
  );
}

type Inline = { byFile: Map<string, InlineNote[]>; placed: number; unsupported: number; outside: number };

/**
 * Decides which AI statements may sit in the diff. Only a statement whose citations all checked
 * out is placed, and only at a citation that points into a file and line this diff displays.
 */
function placeInline(review: ReviewRecord | null, files: Comparison["files"]): Inline {
  const out: Inline = { byFile: new Map(), placed: 0, unsupported: 0, outside: 0 };
  if (!review) return out;
  const reviewer = `${review.model.versionReported ?? review.model.requested} · ${review.createdAt.replace("T", " ").slice(0, 16)} UTC`;
  const shown = new Map<string, Set<number>>();
  files.forEach((f, i) => {
    if (!f.patch || i >= INLINE_PATCH_LIMIT) return;
    const lines = new Set<number>();
    for (const row of parsePatch(f.patch)) {
      if ((row.kind === "add" || row.kind === "ctx") && row.newNo !== null) lines.add(row.newNo);
    }
    shown.set(f.filename, lines);
  });
  const severityTone = { high: "pill-danger", medium: "pill-attention", low: "pill-done" } as const;
  const items = [
    ...review.claims.map((c) => ({ id: c.id, support: c.support, citations: c.citations, text: c.statement, detail: c.reason, action: null, tag: "AI claim", tagTone: "pill-done" })),
    ...review.findings.map((f) => ({
      id: f.id,
      support: f.support,
      citations: f.citations,
      text: f.title,
      detail: f.reason,
      action: f.humanAction,
      tag: `AI finding · ${f.severity} severity`,
      tagTone: severityTone[f.severity],
    })),
  ];
  for (const item of items) {
    if (item.support !== "cited") {
      out.unsupported++;
      continue;
    }
    let count = 0;
    item.citations.forEach((c, n) => {
      if (!c.valid || c.sourceType === "requirement" || !c.path || c.lineStart === null || c.lineEnd === null) return;
      const lines = shown.get(c.path);
      if (!lines) return;
      let anchor = -1;
      for (let l = c.lineEnd; l >= c.lineStart; l--) {
        if (lines.has(l)) {
          anchor = l;
          break;
        }
      }
      if (anchor < 0) return;
      const notes = out.byFile.get(c.path) ?? [];
      notes.push({
        line: anchor,
        key: `${item.id}-${n}`,
        node: <InlineStatement text={item.text} detail={item.detail} action={item.action} tag={item.tag} tagTone={item.tagTone} citation={c} first={count === 0} reviewer={reviewer} />,
      });
      out.byFile.set(c.path, notes);
      count++;
    });
    if (count === 0) out.outside++;
    else out.placed++;
  }
  return out;
}

export function ChangeView({
  userLogin,
  userId,
  repo,
  target,
  data,
  requirementError,
  decisionError,
  reviewer,
}: {
  userLogin: string;
  userId: number;
  repo: SelectedRepo;
  target: PinnedTarget;
  data: ChangeData;
  requirementError?: string;
  decisionError?: string;
  reviewer: { configured: boolean; model: string };
}) {
  const { cmp, liveHead, resolution, review, failure, loadError, stale, decisions, otherHeadDecisions, routing } = data;
  const currentDecision = decisions[decisions.length - 1] ?? null;

  const requirement = resolution?.requirement ?? null;
  const requirementId = requirement ? requirementIdOf(requirement) : null;
  const requirementChanged = Boolean(review && requirementId !== null && requirementId !== review.requirement.id);
  const headCommit = cmp?.commits[cmp.commits.length - 1] ?? null;
  const totals = cmp
    ? {
        files: cmp.files.length,
        add: cmp.files.reduce((n, f) => n + f.additions, 0),
        del: cmp.files.reduce((n, f) => n + f.deletions, 0),
      }
    : null;

  const commitUrl = (sha: string) => `${repo.htmlUrl}/commit/${sha}`;
  const blobUrl = (path: string) =>
    `${repo.htmlUrl}/blob/${target.headSha}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const sourceUrl = (path: string) => `/change/source?path=${encodeURIComponent(path)}&start=1&end=1`;
  const compareUrl = `${repo.htmlUrl}/compare/${target.baseSha}...${target.headSha}`;

  const stages = buildStages(data);
  const summary = stageSummary(data);
  const next = nextStep(data);
  const timeline = buildTimeline(data, target, userLogin);
  const inline = placeInline(review, cmp?.files ?? []);

  const cannotReviewWhy = !reviewer.configured
    ? "GEMINI_API_KEY is not set in .env.local."
    : requirementId === null
      ? "Link a requirement first."
      : stale
        ? "The pin is stale. Pin the new head first."
        : null;

  const title =
    target.kind === "pr" && target.prTitle
      ? target.prTitle
      : (headCommit?.message.split("\n")[0] ?? `Branch ${target.ref}`);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "overview", label: "Overview", icon: <OverviewIcon /> },
    { id: "requirement", label: "Requirement", icon: <RequirementIcon /> },
    { id: "commits", label: "Commits", icon: <CommitIcon />, count: cmp?.totalCommits },
    { id: "files", label: "Files changed", icon: <DiffIcon />, count: totals?.files },
    { id: "review", label: "Review record", icon: <ReviewIcon /> },
    { id: "decision", label: "Decision", icon: <PersonIcon />, count: decisions.length || undefined },
  ];
  const tabHref = (id: Tab) => (id === "overview" ? "/change" : `/change?tab=${id}`);

  const decisionErrors: Record<string, string> = {
    changed: "This page was showing a different pinned change. Nothing was recorded. Reload and try again.",
    choose: "Choose accept, request changes or defer.",
    notes: `Fill in all three notes (${NOTE_MIN} to ${NOTE_MAX} characters each). Nothing was recorded.`,
    github: "GitHub could not be read, so the head could not be confirmed. Nothing was recorded.",
    stale: "The branch head has moved since it was pinned. Nothing was recorded: pin the new head and read it first.",
    accept_needs_requirement: "Accepting needs a linked requirement. Nothing was recorded.",
    accept_needs_review: "Accepting needs a completed AI review for this exact head. Nothing was recorded. You can still request changes or defer.",
  };

  const reviewForm = (label: string, className: string) => (
    <form action={reviewChange} className="flex flex-wrap items-center gap-3 font-normal">
      <input type="hidden" name="baseSha" value={target.baseSha} />
      <input type="hidden" name="headSha" value={target.headSha} />
      {cannotReviewWhy && <span className="text-xs text-muted">{cannotReviewWhy}</span>}
      <SubmitButton disabled={cannotReviewWhy !== null || !cmp} pendingLabel="Reviewing… up to two minutes" className={className}>
        {label}
      </SubmitButton>
    </form>
  );

  const repin = (
    <form action={pinTarget}>
      <input type="hidden" name="kind" value={target.kind} />
      <input type="hidden" name="number" value={target.prNumber ?? ""} />
      <input type="hidden" name="branch" value={target.ref} />
      <button type="submit" className="btn btn-sm">
        Pin the new head
      </button>
    </form>
  );

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <TabsRoot tabs={TABS}>
      {/* ---------- Change header ---------- */}
      <div data-testid="change-header">
        <h1 className="text-[26px] font-semibold leading-tight sm:text-[32px]">
          {title}{" "}
          {target.kind === "pr" && <span className="font-light text-muted">#{target.prNumber}</span>}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-muted">
          <span className={`state ${stateTone[summary.tone]}`} data-testid="stage-pill">
            <BranchIcon />
            {summary.label}
          </span>
          <span>
            <span className="font-semibold text-foreground">@{userLogin}</span> pinned{" "}
            {cmp ? `${cmp.totalCommits} commit${cmp.totalCommits === 1 ? "" : "s"}` : "this change"} from{" "}
            {target.kind === "pr" ? "pull request branch" : "branch"}
          </span>
          <Link href="/target" className="chip" title="Choose a different change">
            {target.ref}
          </Link>
          <span>at</span>
          <span className="flex items-center gap-1.5">
            <a href="/change?tab=commits" className="chip" title={`Base ${target.baseSha}`}>
              {short(target.baseSha)}
            </a>
            <span aria-label="to">→</span>
            <a href="/change?tab=commits" className="chip" title={`Head ${target.headSha}`}>
              {short(target.headSha)}
            </a>
          </span>
          {totals && (
            <span className="flex items-center gap-1.5 md:hidden">
              <Stat additions={totals.add} deletions={totals.del} />
              <ChangeBar additions={totals.add} deletions={totals.del} />
            </span>
          )}
        </div>
      </div>

      {loadError && (
        <p role="alert" className="flash flash-danger mt-4">
          {loadError}
        </p>
      )}
      {stale && (
        <div role="alert" className="flash flash-attention mt-4 flex flex-wrap items-center justify-between gap-3">
          <p>
            {liveHead
              ? `This pin is stale: ${target.kind === "pr" ? "the pull request" : "the branch"} now points at ${short(liveHead)}, not the pinned head. Everything shown is still the pinned commit.`
              : "The pinned branch or pull request no longer exists on GitHub. Everything shown is still the pinned commit."}
          </p>
          {liveHead && repin}
        </div>
      )}

      {/* ---------- Tabs ---------- */}
      <div className="tabnav mt-6">
        <nav aria-label="Change sections" className="flex">
          {tabs.map((t) => (
            <TabLink key={t.id} id={t.id} href={tabHref(t.id)}>
              {t.icon}
              {t.label}
              {t.count !== undefined && <span className="counter">{t.count}</span>}
            </TabLink>
          ))}
        </nav>
        {totals && (
          <span className="ml-auto hidden shrink-0 items-center gap-2 self-center pl-4 md:flex" data-testid="totals">
            <Stat additions={totals.add} deletions={totals.del} />
            <ChangeBar additions={totals.add} deletions={totals.del} />
          </span>
        )}
      </div>

      {/* ---------- Overview ---------- */}
      <TabPanel id="overview">
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_296px]">
          <div className="relative grid min-w-0 grid-cols-1 content-start gap-5 sm:pl-14">
            <span aria-hidden className="absolute bottom-0 left-[19px] top-2 hidden w-0.5 bg-line sm:block" />
            {otherHeadDecisions.map((d) => (
              <p key={d.id} className="flash flash-attention" data-testid="other-head-decision">
                @{d.user.login} recorded &quot;{DECISION_LABEL[d.decision].toLowerCase()}&quot; on {d.at.slice(0, 10)} for head{" "}
                <span className="font-mono">{short(d.headSha)}</span>. That record stays with that commit and does not cover the head
                pinned here (<span className="font-mono">{short(target.headSha)}</span>).
              </p>
            ))}

            <section className="relative" aria-label="AI review summary" data-testid="review-summary">
              <span className="avatar absolute -left-14 top-0 hidden h-10 w-10 text-done sm:flex">
                <BotIcon className="h-5 w-5" />
              </span>
              <div className="box">
                <h2 className="box-head">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    ProofMap reviewer <span className="pill font-normal">AI</span>
                    <span className="font-normal text-muted">
                      {review
                        ? `${review.model.versionReported ?? review.model.requested} reviewed ${review.createdAt.replace("T", " ").slice(0, 16)} UTC`
                        : "has not reviewed this change"}
                    </span>
                  </span>
                  {reviewForm(review ? "Review again" : "Review this change", review ? "btn btn-sm" : "btn btn-sm btn-primary")}
                </h2>
                {failure && (
                  <p role="alert" className="border-b border-line bg-danger/10 px-4 py-2.5 text-[13px]">
                    The last review attempt ({failure.at.replace("T", " ").slice(0, 16)} UTC) produced no review: {failure.message}
                  </p>
                )}
                {review ? (
                  <ReviewLead review={review} stale={stale} requirementChanged={requirementChanged} />
                ) : (
                  <p className="px-4 py-4 text-sm text-muted">
                    <span className="font-medium text-foreground">No AI review exists for this pinned change.</span> Nothing on
                    this page has been analysed by a model.
                  </p>
                )}
                <ChecksBox review={review} />
              </div>
            </section>

            <a href={next.href} className="flash flash-accent block hover:border-accent" data-testid="next-step">
              <span className="eyebrow text-accent">Where this stands</span>
              <span className="mt-0.5 block text-sm font-medium">{next.text}</span>
            </a>

            {review && (
              <>
                <KindLegend />
                <section className="box">
                  <h2 className="box-head">
                    <span>
                      Requirement coverage <span className="counter ml-1">{review.claims.length}</span>
                    </span>
                    <a href="/change?tab=requirement" className="link break-all font-mono text-xs font-normal">
                      {review.requirement.id}
                    </a>
                  </h2>
                  <ReviewCoverage review={review} />
                </section>
                <section className="box">
                  <h2 className="box-head">
                    <span>
                      Findings <span className="counter ml-1">{review.findings.length}</span>
                    </span>
                    <span className="text-xs font-normal text-muted">potential defects and risks</span>
                  </h2>
                  <ReviewFindings review={review} />
                </section>
                <section className="box" id="unverified">
                  <h2 className="box-head">
                    <span>
                      Unverified <span className="counter ml-1">{review.unknowns.length + review.notChecked.length}</span>
                    </span>
                    <span className="text-xs font-normal text-muted">what the evidence cannot establish</span>
                  </h2>
                  <ReviewUnknowns review={review} />
                </section>
              </>
            )}

            <div id="routing" className="scroll-mt-4">
              <RoutingBox routing={routing} />
            </div>

            <section className="box" aria-label="Review timeline">
              <h2 className="box-head">
                Timeline
                <span className="text-xs font-normal text-muted">
                  {timeline.recorded} recorded · {timeline.pending} pending
                </span>
              </h2>
              <Timeline items={timeline.items} />
            </section>
          </div>

          {/* ----- Sidebar ----- */}
          <aside className="min-w-0">
            <section className="side-section" data-testid="decision-card">
              <h2 className="side-title">Human reviewer</h2>
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Avatar userId={userId} size={24} />
                <span className="text-sm font-semibold">{userLogin}</span>
                <span className="ml-auto flex items-center gap-1.5 text-muted">
                  <span className={`h-2 w-2 rounded-full ${currentDecision ? decisionDot[currentDecision.decision] : "bg-attention"}`} />
                  {currentDecision ? DECISION_LABEL[currentDecision.decision] : "Awaiting decision"}
                </span>
              </p>
              <p className="mt-2 text-xs text-muted">
                {currentDecision ? (
                  <>
                    Recorded by @{currentDecision.user.login} on {currentDecision.at.replace("T", " ").slice(0, 16)} UTC for head{" "}
                    <span className="font-mono">{short(currentDecision.headSha)}</span>. A ProofMap record, not a GitHub approval or
                    merge.{stale ? " It does not cover the new branch head." : ""}
                  </>
                ) : (
                  <>
                    No decision is recorded for <span className="font-mono">{short(target.headSha)}</span>. The AI never decides.
                  </>
                )}
              </p>
            </section>

            <section className="side-section">
              <h2 className="side-title">
                Suggested review depth
                <a href="/change#routing" className="link text-xs font-normal">
                  Why
                </a>
              </h2>
              <p className="flex flex-wrap gap-1.5">
                <span className="label" style={{ "--label": routeColor[routing.route] } as React.CSSProperties}>
                  {ROUTE_LABEL[routing.route].toLowerCase()}
                </span>
                <span className="label" style={{ "--label": "var(--attention)" } as React.CSSProperties}>
                  needs a human decision
                </span>
              </p>
              <p className="mt-2 text-xs text-muted">Set by rule from the change itself. There is no trust score.</p>
            </section>

            <section className="side-section">
              <h2 className="side-title">
                Requirement
                <a href="/change?tab=requirement" className="link text-xs font-normal">
                  Details
                </a>
              </h2>
              {requirement ? (
                <>
                  <a href="/change?tab=requirement" className="link break-all font-mono text-xs">
                    {requirementId}
                  </a>
                  <p className="mt-1">{requirement.kind === "issue" ? requirement.issue.title : "Entered by hand"}</p>
                  {requirement.kind === "issue" && (
                    <External href={requirement.issue.htmlUrl} className="link mt-1 inline-flex items-center gap-1 text-xs">
                      Issue on GitHub <ExternalIcon className="h-3 w-3" />
                    </External>
                  )}
                </>
              ) : (
                <p className="text-attention">Not linked. The review cannot start without one.</p>
              )}
            </section>

            <section className="side-section">
              <h2 className="side-title">
                Pinned commits
                <a href="/change?tab=commits" className="link text-xs font-normal">
                  Details
                </a>
              </h2>
              <p className="flex items-start gap-2">
                <CommitIcon className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0">
                  <External href={commitUrl(target.headSha)} className="font-mono text-xs hover:underline">
                    {short(target.headSha)}
                  </External>{" "}
                  <span className="text-muted">head{headCommit ? ` · ${headCommit.message.split("\n")[0]}` : ""}</span>
                </span>
              </p>
              <p className="mt-1.5 flex items-start gap-2">
                <CommitIcon className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0">
                  <External href={commitUrl(target.baseSha)} className="font-mono text-xs hover:underline">
                    {short(target.baseSha)}
                  </External>{" "}
                  <span className="text-muted">base</span>
                </span>
              </p>
              <p className="mt-2 text-xs text-muted">
                {loadError ? "GitHub could not be read, so the head is unconfirmed." : stale ? "Stale: the branch has moved." : "Head still matches GitHub."}
              </p>
            </section>

            <section className="side-section" data-testid="stages">
              <h2 className="side-title">Review stage</h2>
              <ol>
                {stages.map((s) => (
                  <li key={s.key} className="flex gap-2.5 py-1.5">
                    <span className="mt-0.5">
                      <StageMarker state={s.state} />
                    </span>
                    <a href={s.href} className="min-w-0 hover:underline">
                      <span className={`block text-[13px] font-medium ${s.state === "pending" ? "text-muted" : ""}`}>
                        {s.label} <span className="font-normal text-muted">· {stageWord[s.state]}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">{s.note}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>

        <DecisionBar
          userLogin={userLogin}
          current={currentDecision ? DECISION_LABEL[currentDecision.decision].toLowerCase() : null}
          acceptBlocked={!requirement ? "Needs a linked requirement" : !review ? "Needs an AI review of this head" : null}
          blockedReason={
            stale
              ? "The branch head has moved, so no decision can be recorded for this pin. Pin the new head first."
              : loadError
                ? "GitHub could not be read, so the head cannot be confirmed."
                : null
          }
        />
        <p className="mt-2 text-xs text-muted">
          Recording a decision saves a record in ProofMap under your name. It does not approve, merge or comment on anything on GitHub.
        </p>
      </TabPanel>

      {/* ---------- Requirement ---------- */}
      <TabPanel id="requirement">
        <section className="box mt-5 max-w-4xl" data-testid="requirement">
          <h2 className="box-head">Requirement</h2>
          <div className="px-4 py-4 text-sm">
            {!resolution && <p className="text-muted">The requirement could not be looked up.</p>}
            {requirementError && requirementErrors[requirementError] && (
              <p role="alert" className="flash flash-danger mb-4">
                {requirementErrors[requirementError]}
              </p>
            )}

            {requirement?.kind === "issue" && (
              <>
                <p className="font-mono text-xs text-muted">Requirement ID {requirementId}</p>
                <h3 className="mt-1 text-lg font-semibold leading-snug">{requirement.issue.title}</h3>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className={`pill ${requirement.issue.state === "open" ? "pill-success" : "pill-done"}`}>
                    {requirement.issue.state}
                  </span>
                  <span>
                    opened by @{requirement.issue.author} on {requirement.issue.createdAt.slice(0, 10)} · updated{" "}
                    {requirement.issue.updatedAt.slice(0, 10)}
                  </span>
                  <External href={requirement.issue.htmlUrl} className="link inline-flex items-center gap-1 break-all">
                    {requirement.issue.htmlUrl.replace("https://", "")} <ExternalIcon className="h-3 w-3 shrink-0" />
                  </External>
                </p>

                <div className="mt-4 rounded-md border border-line bg-surface px-4 py-3">
                  <p className="text-xs font-semibold">Why this issue is linked</p>
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                    {requirement.evidence.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>

                <p className="mt-4 text-xs text-muted">
                  Issue text as fetched from GitHub just now. It is not pinned to a commit and can be edited by its
                  author; it is shown as plain text and treated as untrusted input.
                </p>
                <pre
                  className="mt-2 max-h-[36rem] scroll-mt-4 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface px-4 py-3 font-mono text-xs leading-5"
                  id="issue-text"
                  data-testid="issue-text"
                >
                  {requirement.issue.body || "(The issue has no description.)"}
                </pre>
              </>
            )}

            {requirement?.kind === "text" && (
              <>
                <p className="font-mono text-xs text-muted">Requirement ID {requirement.id}</p>
                <p className="mt-1 text-xs text-muted">
                  Entered by hand by @{requirement.enteredBy} at {requirement.enteredAt}. It has no source link.
                </p>
                <pre className="mt-3 whitespace-pre-wrap break-words rounded-md border border-line bg-surface px-4 py-3 font-mono text-xs leading-5">
                  {requirement.text}
                </pre>
              </>
            )}

            {resolution && !requirement && (
              <p className="flash flash-attention">
                No reliable requirement was found for this change, so none is assumed.{" "}
                {resolution.issueNumber === null
                  ? "The branch name does not name an issue."
                  : `Issue #${resolution.issueNumber} (from the ${resolution.numberSource}) was not found in any repository that could be tied to this one.`}{" "}
                Enter it below.
              </p>
            )}

            {resolution && resolution.attempts.length > 0 && (
              <details className="mt-4 text-xs text-muted">
                <summary className="cursor-pointer">Where ProofMap looked ({resolution.attempts.length})</summary>
                <ul className="mt-2 list-disc pl-5">
                  {resolution.attempts.map((a) => (
                    <li key={`${a.repo}-${a.relation}`}>
                      <span className="font-mono">{a.repo}</span> ({a.relation}): {a.outcome}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {requirement && (requirement.kind === "text" || requirement.manual) && (
              <form action={resetManualRequirement} className="mt-4">
                <button type="submit" className="link text-xs">
                  Remove the manual requirement and look it up again
                </button>
              </form>
            )}

            {resolution && (
              <details className="mt-4" open={!requirement || Boolean(requirementError)}>
                <summary className="cursor-pointer text-xs text-muted">
                  {requirement ? "Wrong requirement? Enter it manually" : "Enter the requirement manually"}
                </summary>
                <form action={setManualRequirement} className="mt-3 grid max-w-xl gap-3">
                  <label className="grid gap-1 text-xs font-medium">
                    GitHub issue link
                    <input name="reference" className="input" placeholder="https://github.com/owner/repo/issues/123" />
                  </label>
                  <p className="text-xs text-muted">Or, if the requirement is not a GitHub issue:</p>
                  <label className="grid gap-1 text-xs font-medium">
                    Requirement ID
                    <input name="id" maxLength={80} className="input" placeholder="REQ-42" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium">
                    Requirement text (up to {MAX_MANUAL_TEXT} characters)
                    <textarea name="text" rows={5} maxLength={MAX_MANUAL_TEXT} className="input" />
                  </label>
                  <div>
                    <button type="submit" className="btn btn-primary">
                      Save requirement
                    </button>
                  </div>
                </form>
              </details>
            )}
          </div>
        </section>
      </TabPanel>

      {/* ---------- Commits ---------- */}
      <TabPanel id="commits">
        <div className="mt-5 grid max-w-4xl grid-cols-1 gap-5">
          <section className="box" data-testid="pinned">
            <h2 className="box-head">
              Pinned commits
              <span className="flex flex-wrap gap-x-3 text-xs font-normal">
                <External href={compareUrl}>Same diff on GitHub</External>
                <External href={`${repo.htmlUrl}/tree/${target.headSha}`}>Files at head</External>
                {target.kind === "pr" && <External href={`${repo.htmlUrl}/pull/${target.prNumber}`}>Pull request</External>}
              </span>
            </h2>
            <dl className="grid gap-x-6 gap-y-3 px-4 py-4 text-sm sm:grid-cols-[7rem_1fr]">
              <dt className="text-muted">Base (parent)</dt>
              <dd className="break-all font-mono text-xs" data-testid="base-sha">
                <External href={commitUrl(target.baseSha)}>{target.baseSha}</External>
              </dd>
              <dt className="text-muted">Head</dt>
              <dd className="break-all font-mono text-xs" data-testid="head-sha">
                <External href={commitUrl(target.headSha)}>{target.headSha}</External>
              </dd>
              <dt className="text-muted">Why this base</dt>
              <dd>{target.baseRule}</dd>
              <dt className="text-muted">Pinned</dt>
              <dd>
                {target.pinnedAt} by @{userLogin}
                {!loadError && !stale && <span className="text-muted"> · head still matches GitHub</span>}
              </dd>
            </dl>
            {target.kind === "branch" && cmp && cmp.commits.length > 1 && (
              <form action={pinTarget} className="box-row px-4 py-3 text-sm">
                <input type="hidden" name="kind" value="branch" />
                <input type="hidden" name="branch" value={target.ref} />
                <input type="hidden" name="mode" value="head-commit" />
                <span className="text-muted">Only the last commit is the agent&apos;s? </span>
                <button type="submit" className="link">
                  Pin just the head commit against its parent
                </button>
              </form>
            )}
          </section>

          {cmp && (
            <section className="box" data-testid="commits">
              <h2 className="box-head">
                <span>
                  Commits in this change <span className="counter ml-1">{cmp.totalCommits}</span>
                </span>
              </h2>
              <ul>
                {cmp.commits.map((c) => (
                  <li key={c.sha} className="box-row flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="whitespace-pre-wrap text-sm font-medium">{c.message}</p>
                      <p className="mt-1 text-xs text-muted">
                        {c.authorName}
                        {c.authorLogin ? ` (@${c.authorLogin})` : ""} authored on {c.date.replace("T", " ").replace("Z", " UTC")}
                      </p>
                    </div>
                    <External href={commitUrl(c.sha)} className="chip shrink-0">
                      {short(c.sha)}
                    </External>
                  </li>
                ))}
              </ul>
              {cmp.commits.length < cmp.totalCommits && (
                <p className="box-row px-4 py-3 text-xs text-muted">
                  Showing {cmp.commits.length} of {cmp.totalCommits} commits. GitHub lists the rest.
                </p>
              )}
            </section>
          )}
        </div>
      </TabPanel>

      {/* ---------- Files changed ---------- */}
      <TabPanel id="files">
        {cmp && totals && (
        <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[268px_minmax(0,1fr)]" data-testid="files">
          <aside className="max-h-72 min-w-0 overflow-y-auto lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start">
            <FileTree
              files={cmp.files.map((f, i) => ({
                path: f.filename,
                index: i,
                additions: f.additions,
                deletions: f.deletions,
                notes: inline.byFile.get(f.filename)?.length ?? 0,
              }))}
            />
          </aside>

          <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>
              Showing <span className="font-semibold">{totals.files} changed file{totals.files === 1 ? "" : "s"}</span> with{" "}
              <span className="font-semibold text-success">{totals.add} additions</span> and{" "}
              <span className="font-semibold text-danger">{totals.del} deletions</span>, at pinned head{" "}
              <a href="/change?tab=commits" className="chip align-middle">
                {short(target.headSha)}
              </a>
            </p>
            <External href={compareUrl} className="btn btn-sm">
              Same diff on GitHub <ExternalIcon className="h-3 w-3" />
            </External>
          </div>
          {cmp.files.length >= 300 && (
            <p className="flash flash-attention mt-3">
              GitHub returns at most 300 files for a comparison, so this list may be incomplete. Use &quot;Same diff on
              GitHub&quot; for the full change.
            </p>
          )}

          <p className="flash mt-3 text-muted" data-testid="inline-summary">
            {review ? (
              <>
                <span className="font-medium text-foreground">
                  {inline.placed} AI statement{inline.placed === 1 ? " is" : "s are"} shown beside the lines {inline.placed === 1 ? "it cites" : "they cite"}.
                </span>{" "}
                A statement appears in the diff only when its citation was found at that file and line in the pinned head. That
                shows the cited text exists, not that the statement is true: no build or test has been run.
                {inline.outside + inline.unsupported + review.unknowns.length > 0 && (
                  <>
                    {" "}
                    Kept out of the diff:{" "}
                    {[
                      inline.unsupported > 0 ? `${inline.unsupported} unsupported (a citation was rejected)` : null,
                      inline.outside > 0 ? `${inline.outside} citing only the requirement or lines outside this diff` : null,
                      review.unknowns.length > 0 ? `${review.unknowns.length} unverified question${review.unknowns.length === 1 ? "" : "s"}` : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    .{" "}
                    <a href="/change#unverified" className="link">
                      See them on the overview
                    </a>
                    .
                  </>
                )}
              </>
            ) : (
              "No AI review exists for this pinned change, so the diff carries no AI statements."
            )}
          </p>

          {cmp.files.map((f, i) => {
            const notes = inline.byFile.get(f.filename) ?? [];
            return (
            <details
              key={f.filename}
              id={`file-${i}`}
              open={cmp.files.length <= EXPAND_LIMIT}
              className="box group mt-4 scroll-mt-4 overflow-hidden"
              data-testid="file-diff"
            >
              <summary className="box-head cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronIcon className="shrink-0 -rotate-90 text-muted transition-transform group-open:rotate-0" />
                  <FileIcon className="shrink-0 text-muted" />
                  <span className="break-all text-[13px]">
                    {f.previousFilename ? `${f.previousFilename} → ` : ""}
                    {f.filename}
                  </span>
                  <Stat additions={f.additions} deletions={f.deletions} />
                </span>
                <span className="flex shrink-0 items-center gap-2.5 font-normal">
                  {notes.length > 0 && <span className="pill pill-done">{notes.length} AI cited</span>}
                  {f.status !== "modified" && <span className="pill">{f.status}</span>}
                  {f.status !== "removed" && (
                    <>
                      <Link href={sourceUrl(f.filename)} className="btn btn-sm">
                        View file
                      </Link>
                      <External href={blobUrl(f.filename)} className="text-muted hover:text-accent">
                        <ExternalIcon />
                        <span className="sr-only">Open on GitHub</span>
                      </External>
                    </>
                  )}
                </span>
              </summary>
              {f.patch && i < INLINE_PATCH_LIMIT ? (
                <DiffView patch={f.patch} notes={notes} />
              ) : (
                <p className="px-4 py-3 text-xs text-muted">
                  {f.patch
                    ? "Not rendered here because this change has many files."
                    : "GitHub did not return a text diff for this file (binary, or too large)."}{" "}
                  <External href={compareUrl}>See it on GitHub</External>
                </p>
              )}
            </details>
            );
          })}
          </div>
        </section>
        )}
      </TabPanel>

      {/* ---------- Review record ---------- */}
      <TabPanel id="review">
        <section className="box mt-5 max-w-4xl" id="review">
          <div className="box-head">
            <h2>AI review record</h2>
            {reviewForm(review ? "Review again" : "Review this change", "btn btn-sm")}
          </div>
          {failure && (
            <p role="alert" className="border-b border-line bg-danger/10 px-4 py-3 text-sm" data-testid="review-failure">
              The last review attempt ({failure.at}) produced no review: {failure.message}
            </p>
          )}
          {review ? (
            <>
              <ReviewLead review={review} stale={stale} requirementChanged={requirementChanged} />
              <div className="box-row">
                <ReviewRecordDetails review={review} />
              </div>
            </>
          ) : (
            <div className="px-4 py-4 text-sm text-muted">
              <p className="font-medium text-foreground">No AI review exists for this pinned change.</p>
              <p className="mt-1">
                When run, the review sends the linked requirement, the pinned diff, a README excerpt and the code around
                each change to {reviewer.model}, then checks every citation in the answer against the pinned snapshot
                before showing it. It produces advice with evidence, never an approval.
              </p>
            </div>
          )}
        </section>
      </TabPanel>

      {/* ---------- Decision ---------- */}
      <TabPanel id="decision">
        <div className="mt-5 grid max-w-4xl grid-cols-1 gap-5" data-testid="decision">
          {decisionError && decisionErrors[decisionError] && (
            <p role="alert" className="flash flash-danger">
              {decisionErrors[decisionError]}
            </p>
          )}

          {otherHeadDecisions.map((d) => (
            <p key={d.id} className="flash flash-attention">
              @{d.user.login} recorded &quot;{DECISION_LABEL[d.decision].toLowerCase()}&quot; on {d.at.slice(0, 10)} for head{" "}
              <span className="font-mono">{short(d.headSha)}</span>. It does not cover the head pinned here.
            </p>
          ))}

          <section className="box">
            <h2 className="box-head">
              <span>
                Recorded decisions <span className="counter ml-1">{decisions.length}</span>
              </span>
              <span className="pill pill-accent font-normal">Human decision</span>
            </h2>
            {decisions.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">
                Nobody has recorded a decision for head <span className="font-mono">{short(target.headSha)}</span>.
              </p>
            ) : (
              <ul>
                {[...decisions].reverse().map((d, i) => (
                  <li key={d.id} className="box-row px-4 py-4 text-[13px]" data-testid="decision-record">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {DECISION_LABEL[d.decision]}
                      {i === 0 ? <span className="pill">current</span> : <span className="pill pill-pending">superseded</span>}
                      {stale && <span className="pill pill-attention">does not cover the new head</span>}
                    </p>
                    <p className="mt-1 text-muted">
                      {d.user.name ? `${d.user.name} ` : ""}(@{d.user.login}, GitHub ID {d.user.id}) · {d.at}
                    </p>
                    <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]">
                      <dt className="text-muted">Evidence checked</dt>
                      <dd className="whitespace-pre-wrap">{d.evidenceChecked}</dd>
                      <dt className="text-muted">Not checked</dt>
                      <dd className="whitespace-pre-wrap">{d.unchecked}</dd>
                      <dt className="text-muted">Residual risk accepted</dt>
                      <dd className="whitespace-pre-wrap">{d.residualRisk}</dd>
                      <dt className="text-muted">Requirement</dt>
                      <dd className="break-all font-mono text-xs">{d.requirementId ?? "none linked"}</dd>
                      <dt className="text-muted">Base → head</dt>
                      <dd className="break-all font-mono text-xs">
                        {d.baseSha} → {d.headSha}
                      </dd>
                      <dt className="text-muted">AI review read</dt>
                      <dd>{d.reviewCreatedAt ? `${d.reviewModel}, ${d.reviewCreatedAt}` : "none existed"}</dd>
                    </dl>
                    <p className="mt-3 text-xs text-muted">
                      A record inside ProofMap. Nothing was merged, approved or posted on GitHub.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="box">
            <h2 className="box-head">{decisions.length ? "Record a new decision" : "Record your decision"}</h2>
            {stale || loadError ? (
              <p className="px-4 py-4 text-sm text-attention">
                {stale
                  ? "The branch head has moved, so a decision cannot be recorded for this pin. Pin the new head and read it first."
                  : "GitHub could not be read, so the head cannot be confirmed."}
              </p>
            ) : (
              <form action={recordDecision} id="decision-form" className="grid scroll-mt-4 gap-4 px-4 py-4 text-sm">
                <input type="hidden" name="baseSha" value={target.baseSha} />
                <input type="hidden" name="headSha" value={target.headSha} />
                <p className="text-[13px] text-muted">
                  You are signing as <span className="font-medium text-foreground">@{userLogin}</span> for head{" "}
                  <span className="font-mono text-xs">{short(target.headSha)}</span>
                  {requirementId ? (
                    <>
                      {" "}
                      against requirement <span className="font-mono text-xs">{requirementId}</span>
                    </>
                  ) : null}
                  . Suggested depth of review: {routing.route.replace("-", " ")}.
                </p>
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-xs font-semibold">Decision</legend>
                  {(
                    [
                      ["accept", "Accept for this reference demo", review ? "" : "needs a completed AI review for this head"],
                      ["request-changes", "Request changes", ""],
                      ["defer", "Defer", ""],
                    ] as const
                  ).map(([value, label, blocked]) => (
                    <label key={value} className={`flex items-center gap-2 ${blocked ? "text-muted" : ""}`}>
                      <input type="radio" name="decision" value={value} required disabled={Boolean(blocked)} />
                      {label}
                      {blocked && <span className="text-xs">({blocked})</span>}
                    </label>
                  ))}
                </fieldset>
                <label className="grid gap-1 text-xs font-semibold">
                  What evidence did you check yourself?
                  <textarea name="evidenceChecked" rows={3} required minLength={NOTE_MIN} maxLength={NOTE_MAX} className="input font-normal" placeholder="For example: read the guard in TypeCollector.cs lines 1429-1454; opened two citations and they matched." />
                </label>
                <label className="grid gap-1 text-xs font-semibold">
                  What remains unchecked?
                  <textarea name="unchecked" rows={3} required minLength={NOTE_MIN} maxLength={NOTE_MAX} className="input font-normal" placeholder="For example: tests were not run; the analyzer path was not exercised." />
                </label>
                <label className="grid gap-1 text-xs font-semibold">
                  What residual risk do you accept?
                  <textarea name="residualRisk" rows={3} required minLength={NOTE_MIN} maxLength={NOTE_MAX} className="input font-normal" placeholder="For example: the fix may not cover other diagnostics that use DeclaringSyntaxReferences." />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton pendingLabel="Recording…" className="btn btn-primary">
                    Record decision as @{userLogin}
                  </SubmitButton>
                  <span className="text-xs text-muted">This does not merge or approve anything on GitHub.</span>
                </div>
              </form>
            )}
          </section>
        </div>
      </TabPanel>

      {!loadError && !cmp && (
        <p role="alert" className="flash flash-danger mt-5">
          GitHub could not produce a diff between the pinned commits. Choose the change again.
        </p>
      )}
      </TabsRoot>
    </main>
  );
}
