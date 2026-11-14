import "server-only";
import type { TimelineItem } from "@/components/timeline";
import { currentHeadSha } from "./change";
import { DECISION_LABEL, loadDecisions, loadDecisionsOnOtherHeads, type Decision } from "./decision";
import { GitHubError, compare, getPull, gitHubRequestCount, type Comparison } from "./github";
import { getManualRequirement, resolveRequirement, type RequirementResolution } from "./requirement";
import { requirementIdOf } from "./review/context";
import { routeChange, type Routing } from "./review/routing";
import { loadFailure, loadReview } from "./review/store";
import type { ReviewFailure, ReviewRecord } from "./review/types";
import type { PinnedTarget, SelectedRepo } from "./session";

/** Everything the pinned change page shows, read once per request. */
export type ChangeData = {
  cmp: Comparison | null;
  liveHead: string | null;
  resolution: RequirementResolution | null;
  review: ReviewRecord | null;
  failure: ReviewFailure | null;
  loadError: string | null;
  stale: boolean;
  /** Decisions recorded for exactly these pinned SHAs, oldest first. */
  decisions: Decision[];
  /** Latest decisions on other heads of the same branch. They do not cover this head. */
  otherHeadDecisions: Decision[];
  routing: Routing;
};

export async function loadChange(token: string, repo: SelectedRepo, target: PinnedTarget): Promise<ChangeData> {
  let cmp: Comparison | null = null;
  let liveHead: string | null = null;
  let resolution: RequirementResolution | null = null;
  let review: ReviewRecord | null = null;
  let failure: ReviewFailure | null = null;
  let loadError: string | null = null;
  let decisions: Decision[] = [];
  let otherHeadDecisions: Decision[] = [];
  const started = Date.now();
  const requestsBefore = gitHubRequestCount();
  try {
    [review, failure, decisions, otherHeadDecisions] = await Promise.all([
      loadReview(repo.id, target.baseSha, target.headSha),
      loadFailure(repo.id, target.baseSha, target.headSha),
      loadDecisions(repo.id, target.baseSha, target.headSha),
      loadDecisionsOnOtherHeads(repo.id, target.ref, target.headSha),
    ]);
    // Everything is started at once. The requirement lookup only needs the commit list for one
    // piece of supporting evidence, so it takes it as a promise instead of waiting for the diff.
    const comparePromise = compare(token, repo.fullName, target.baseSha, target.headSha);
    const commitsPromise = comparePromise.then((c) => c?.commits ?? []);
    commitsPromise.catch(() => {}); // A failure surfaces through comparePromise below.
    const pullPromise =
      target.kind === "pr" && target.prNumber !== null ? getPull(token, repo.fullName, target.prNumber) : Promise.resolve(null);
    const resolutionPromise = Promise.all([pullPromise, getManualRequirement(repo.id, target.headSha)]).then(([pull, manual]) =>
      resolveRequirement(token, repo.fullName, target, pull?.body ?? null, commitsPromise, manual),
    );
    const [c, live, res] = await Promise.all([
      comparePromise,
      currentHeadSha(token, repo.fullName, target),
      resolutionPromise,
    ]);
    cmp = c;
    liveHead = live;
    // Without a diff there is nothing to link a requirement to.
    resolution = cmp ? res : null;
  } catch (e) {
    loadError =
      e instanceof GitHubError && e.status === 401
        ? "GitHub no longer accepts this session. Sign out and sign in again."
        : "Could not read the pinned change from GitHub. Try refreshing the page.";
  }
  console.log(
    `[change] ${target.headSha.slice(0, 10)} loaded in ${Date.now() - started}ms with ${gitHubRequestCount() - requestsBefore} GitHub requests${loadError ? " (failed)" : ""}`,
  );
  const routing = routeChange({
    files: cmp?.files ?? [],
    hasRequirement: Boolean(resolution?.requirement),
    review,
    reviewFailed: Boolean(failure),
    checksExecuted: 0,
  });
  return {
    cmp,
    liveHead,
    resolution,
    review,
    failure,
    loadError,
    stale: !loadError && liveHead !== target.headSha,
    decisions,
    otherHeadDecisions,
    routing,
  };
}

export type StageState = "done" | "failed" | "action" | "pending";
export type Stage = { key: string; label: string; state: StageState; note: string; href: string };

/**
 * Where the review stands. A stage is "done" only when a record exists for it;
 * the last three cannot be done by anything built so far except the AI review.
 */
export function buildStages(data: ChangeData): Stage[] {
  const requirement = data.resolution?.requirement ?? null;
  const current = data.decisions[data.decisions.length - 1] ?? null;
  return [
    {
      key: "pinned",
      label: "Change pinned",
      state: data.stale ? "action" : "done",
      note: data.stale ? "The branch has moved since it was pinned." : "Base and head commits are fixed.",
      href: "/change?tab=commits",
    },
    {
      key: "requirement",
      label: "Requirement linked",
      state: requirement ? "done" : "action",
      note: requirement ? requirementIdOf(requirement) : "None found. Enter one.",
      href: "/change?tab=requirement",
    },
    {
      key: "review",
      label: "AI review",
      state: data.review ? "done" : data.failure ? "failed" : "pending",
      note: data.review
        ? "Advice recorded. Nothing was executed."
        : data.failure
          ? "Last attempt returned no result."
          : "Not run.",
      href: "/change?tab=review",
    },
    {
      key: "checks",
      label: "Evidence checks",
      state: "pending",
      note: "No build, test or fault probe has run.",
      href: "/change?tab=review",
    },
    {
      key: "decision",
      label: "Named human decision",
      state: current ? "done" : "pending",
      note: current ? `${DECISION_LABEL[current.decision]} by @${current.user.login}` : "Nobody has decided.",
      href: "/change?tab=decision",
    },
  ];
}

/** A short, honest label for the header. A decision is named as a person's record, never as "approved". */
export function stageSummary(data: ChangeData): { label: string; tone: "attention" | "danger" | "accent" | "muted" | "success" } {
  if (data.loadError) return { label: "Could not load", tone: "danger" };
  if (data.stale) return { label: "Pin is stale", tone: "attention" };
  const current = data.decisions[data.decisions.length - 1];
  if (current) {
    return {
      label: `${DECISION_LABEL[current.decision]} by @${current.user.login}`,
      tone: current.decision === "accept" ? "success" : current.decision === "request-changes" ? "danger" : "attention",
    };
  }
  if (!data.resolution?.requirement) return { label: "Needs a requirement", tone: "attention" };
  if (data.review) return { label: "AI advice recorded · awaiting your decision", tone: "accent" };
  if (data.failure) return { label: "AI review attempt failed", tone: "attention" };
  return { label: "Awaiting AI review", tone: "muted" };
}

export function nextStep(data: ChangeData): { text: string; href: string } {
  if (data.loadError) return { text: "Reload the page: GitHub could not be read.", href: "/change" };
  if (data.stale) return { text: "The branch has moved. Pin the new head before doing anything else.", href: "/change" };
  if (!data.resolution?.requirement) {
    return { text: "Link a requirement, so there is something to check the change against.", href: "/change?tab=requirement" };
  }
  if (!data.review) {
    return {
      text: data.failure ? "The last AI review attempt returned nothing. Run it again." : "Run the AI review.",
      href: "/change?tab=review",
    };
  }
  if (data.decisions.length === 0) {
    return { text: "Read the evidence below, check what matters yourself, then record your decision.", href: "/change?tab=decision" };
  }
  return { text: "A decision is recorded for this head. You can record a new one if your view changes.", href: "/change?tab=decision" };
}

const short = (sha: string) => sha.slice(0, 10);

/** Only events with a record behind them are completed. Later steps are listed as pending. */
export function buildTimeline(data: ChangeData, target: PinnedTarget, userLogin: string): { items: TimelineItem[]; recorded: number; pending: number } {
  const { cmp, review, failure } = data;
  const requirement = data.resolution?.requirement ?? null;
  const done: TimelineItem[] = [];

  if (requirement?.kind === "issue") {
    done.push({
      key: "issue",
      state: "done",
      title: `Issue #${requirement.issue.number} opened`,
      detail: requirement.issue.title,
      source: "GitHub",
      actor: `@${requirement.issue.author}`,
      at: requirement.issue.createdAt,
      href: "/change?tab=requirement",
    });
  }
  for (const c of cmp?.commits ?? []) {
    done.push({
      key: `commit-${c.sha}`,
      state: "done",
      title: "Commit authored",
      detail: c.message.split("\n")[0],
      source: "GitHub",
      actor: c.authorLogin ? `@${c.authorLogin}` : c.authorName,
      at: c.date,
      sha: c.sha,
      href: "/change?tab=commits",
    });
  }
  done.push({
    key: "pinned",
    state: "done",
    title: `${target.kind === "pr" ? "Pull request" : "Branch"} selected and commits pinned`,
    detail: `Base ${short(target.baseSha)} → head ${short(target.headSha)}`,
    source: "Human",
    actor: `@${userLogin}`,
    at: target.pinnedAt,
    sha: target.headSha,
    href: "/change?tab=commits",
  });
  if (requirement?.kind === "text") {
    done.push({
      key: "requirement",
      state: "done",
      title: "Requirement entered by hand",
      detail: `Requirement ID ${requirement.id}`,
      source: "Human",
      actor: `@${requirement.enteredBy}`,
      at: requirement.enteredAt,
      href: "/change?tab=requirement",
    });
  }
  if (review) {
    const unsupported =
      review.claims.filter((c) => c.support === "unsupported").length +
      review.findings.filter((f) => f.support === "unsupported").length;
    done.push({
      key: "review",
      state: "done",
      title: "AI review recorded",
      detail: `${review.model.versionReported ?? review.model.requested}: ${review.claims.length} coverage claims, ${review.findings.length} findings, ${review.unknowns.length} unverified questions, ${unsupported} unsupported. Base ${short(review.baseSha)} → head ${short(review.headSha)}. Advice only; nothing was executed.`,
      source: "Model",
      actor: `requested by @${review.requestedBy}`,
      at: review.createdAt,
      sha: review.headSha,
      href: "/change?tab=review",
    });
    const cite = review.checks.find((c) => c.type === "citation");
    if (cite) {
      done.push({
        key: "citations",
        state: cite.result === "pass" ? "done" : "failed",
        title: "Citations checked against the pinned snapshot",
        detail: cite.detail,
        source: "ProofMap",
        // Recorded a moment after the model answered; kept in order by the sort below.
        at: review.events.find((e) => e.kind === "citations-checked")?.at ?? review.createdAt,
        sha: review.headSha,
        href: "/change?tab=review",
      });
    }
  } else if (failure) {
    done.push({
      key: "review-failed",
      state: "failed",
      title: "AI review attempted",
      detail: failure.message,
      source: "ProofMap",
      actor: `requested by @${failure.requestedBy}`,
      at: failure.at,
      sha: target.headSha,
      href: "/change?tab=review",
    });
  }
  for (const d of data.decisions) {
    done.push({
      key: `decision-${d.id}`,
      state: "done",
      title: `Decision: ${DECISION_LABEL[d.decision].toLowerCase()}`,
      detail: `Requirement ${d.requirementId ?? "none"}. Base ${short(d.baseSha)} → head ${short(d.headSha)}. A ProofMap record; nothing was merged or approved on GitHub.`,
      source: "Human",
      actor: `@${d.user.login}`,
      at: d.at,
      sha: d.headSha,
      href: "/change?tab=decision",
    });
  }
  done.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));

  // The automatic issue link is re-derived on every page load, so it has no stored time.
  // It sits right after the pin, the earliest moment it could have been made.
  if (requirement?.kind === "issue") {
    done.splice(done.findIndex((d) => d.key === "pinned") + 1, 0, {
      key: "requirement",
      state: "done",
      title: "Requirement linked",
      detail: `${requirementIdOf(requirement)}${requirement.manual ? ", linked by hand" : ", matched from the branch name and shared Git history"}`,
      source: requirement.manual ? "Human" : "ProofMap",
      timeNote: "re-checked each time this page loads",
      href: "/change?tab=requirement",
    });
  }

  const pending: TimelineItem[] = [];
  if (!requirement && !data.loadError) {
    pending.push({
      key: "p-requirement",
      state: "pending",
      title: "Link a requirement",
      detail: "No reliable requirement was found. Enter one on the Requirement tab.",
      source: "Human",
    });
  }
  if (!review) {
    pending.push({
      key: "p-review",
      state: "pending",
      title: "AI review",
      detail: "The reviewer reads the requirement, diff and surrounding code, and proposes cited claims, findings and unknowns.",
      source: "Model",
    });
  }
  pending.push(
    {
      key: "p-checks",
      state: "pending",
      title: "Evidence checks",
      detail: "Build, targeted tests and a fault probe, run by tools. Not available yet, so no claim can be marked verified.",
      source: "ProofMap",
    },
  );
  if (data.decisions.length === 0) {
    pending.push({
      key: "p-decision",
      state: "pending",
      title: "Named human decision",
      detail: "A signed-in engineer records accept, request changes or defer for this exact head commit. Nobody has decided yet.",
      source: "Human",
    });
  }
  return { items: [...done, ...pending], recorded: done.length, pending: pending.length };
}
