import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getCommit, getIssue, getReadme, getRepoInfo, type CommitSummary, type Issue } from "./github";
import { cookieOptions, seal, unsealJson, type PinnedTarget } from "./session";

export const REQUIREMENT_COOKIE = "pm_requirement";
export const MAX_MANUAL_TEXT = 2000;

/** A requirement the signed-in person supplied by hand, tied to one pinned change. */
export type ManualRequirement = {
  repoId: number;
  headSha: string;
  enteredBy: string;
  enteredAt: string;
} & (
  | { kind: "issue"; issueRepo: string; issueNumber: number }
  | { kind: "text"; id: string; text: string }
);

export async function getManualRequirement(repoId: number, headSha: string): Promise<ManualRequirement | null> {
  const value = (await cookies()).get(REQUIREMENT_COOKIE)?.value;
  if (!value) return null;
  const req = unsealJson<ManualRequirement>(value);
  return req && req.repoId === repoId && req.headSha === headSha ? req : null;
}

/** Only callable from a Server Function or Route Handler. */
export async function saveManualRequirement(req: ManualRequirement): Promise<void> {
  (await cookies()).set(REQUIREMENT_COOKIE, seal(req), { ...cookieOptions, maxAge: 8 * 60 * 60 });
}

/** Only callable from a Server Function or Route Handler. */
export async function clearManualRequirement(): Promise<void> {
  (await cookies()).delete(REQUIREMENT_COOKIE);
}

/** "ju26-issue-2283" -> 2283. Only matches an explicit "issue" marker, never a bare number. */
export function issueNumberFromRef(ref: string): number | null {
  const m = /(?:^|[-_/])issues?[-_/]?#?(\d{1,7})(?=$|[-_/.])/i.exec(ref);
  return m ? Number(m[1]) : null;
}

/** GitHub closing keywords in a pull request description: "Fixes #12". */
export function issueNumberFromPullBody(body: string | null): number | null {
  const m = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d{1,7})\b/i.exec(body ?? "");
  return m ? Number(m[1]) : null;
}

/** Accepts "https://github.com/owner/repo/issues/12" or "owner/repo#12". */
export function parseIssueReference(input: string): { repo: string; number: number } | null {
  const s = input.trim();
  const url = /^https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d{1,7})(?:[/?#].*)?$/i.exec(s);
  if (url) return { repo: url[1], number: Number(url[2]) };
  const short = /^([\w.-]+\/[\w.-]+)#(\d{1,7})$/.exec(s);
  return short ? { repo: short[1], number: Number(short[2]) } : null;
}

export type Attempt = { repo: string; relation: string; outcome: string };

export type Requirement =
  | {
      kind: "issue";
      issueRepo: string;
      issue: Issue;
      /** Why this issue is believed to be the requirement. Each line is a checkable fact. */
      evidence: string[];
      manual: boolean;
    }
  | { kind: "text"; id: string; text: string; enteredBy: string; enteredAt: string };

export type RequirementResolution = {
  issueNumber: number | null;
  numberSource: string | null;
  requirement: Requirement | null;
  attempts: Attempt[];
  /** Whether a pinned commit message mentions "#<issueNumber>". */
  commitMentions: boolean;
};

function readmeRepoLinks(readme: string): string[] {
  const counts = new Map<string, number>();
  for (const m of readme.matchAll(/github\.com\/([\w.-]+\/[\w.-]+)/gi)) {
    const name = m[1].replace(/\.git$/i, "").replace(/[.]+$/, "");
    counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);
}

/**
 * Where the issue for a pinned change was found. The search result depends only on pinned
 * commits and fork relations, so it is remembered for a short while per person; the issue
 * text itself is always fetched fresh.
 */
type Located = { at: number; repo: string; relation: string; extraEvidence: string[]; attempts: Attempt[] };
const LOCATED_TTL_MS = 10 * 60 * 1000;
const located = new Map<string, Located>();

/**
 * Finds the issue that states the requirement for a pinned change.
 *
 * Order: a manual entry wins; otherwise the issue number is looked up in the
 * selected repository, then its GitHub-registered fork parents, then repositories
 * the README links to. A README-linked repository only counts when it contains the
 * pinned base commit, which shows the two share Git history. Nothing is guessed:
 * when no candidate passes, the result is null and the person is asked.
 */
export async function resolveRequirement(
  token: string,
  repoFullName: string,
  target: PinnedTarget,
  pullBody: string | null,
  commitsInput: CommitSummary[] | Promise<CommitSummary[]>,
  manual: ManualRequirement | null,
): Promise<RequirementResolution> {
  let issueNumber = issueNumberFromRef(target.ref);
  let numberSource = issueNumber !== null ? `branch name "${target.ref}"` : null;
  if (issueNumber === null && target.kind === "pr") {
    issueNumber = issueNumberFromPullBody(pullBody);
    if (issueNumber !== null) numberSource = `closing keyword in pull request #${target.prNumber}`;
  }
  const mentions = async (n: number) => (await commitsInput).some((c) => new RegExp(`#${n}\\b`).test(c.message));
  let attempts: Attempt[] = [];

  if (manual?.kind === "text") {
    return {
      issueNumber,
      numberSource,
      attempts,
      commitMentions: issueNumber !== null && (await mentions(issueNumber)),
      requirement: { kind: "text", id: manual.id, text: manual.text, enteredBy: manual.enteredBy, enteredAt: manual.enteredAt },
    };
  }
  if (manual?.kind === "issue") {
    const issue = await getIssue(token, manual.issueRepo, manual.issueNumber);
    if (issue && !issue.isPullRequest) {
      return {
        issueNumber: manual.issueNumber,
        numberSource: `entered by @${manual.enteredBy}`,
        attempts,
        commitMentions: await mentions(manual.issueNumber),
        requirement: {
          kind: "issue",
          issueRepo: manual.issueRepo,
          issue,
          manual: true,
          evidence: [`@${manual.enteredBy} linked this issue by hand at ${manual.enteredAt}.`],
        },
      };
    }
    attempts.push({
      repo: manual.issueRepo,
      relation: "entered by hand",
      outcome: `issue #${manual.issueNumber} could not be read`,
    });
  }

  if (issueNumber === null) {
    return { issueNumber, numberSource, attempts, commitMentions: false, requirement: null };
  }
  const n = issueNumber;

  // Every lookup below is remembered for this call, so work can be started early and awaited later.
  // The decision order further down is unchanged: only the waiting happens at the same time.
  const quiet = <T>(p: Promise<T>): Promise<T> => {
    p.catch(() => {});
    return p;
  };
  const memo = <T>(store: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> => {
    let p = store.get(key);
    if (!p) store.set(key, (p = quiet(make())));
    return p;
  };
  const issues = new Map<string, Promise<Awaited<ReturnType<typeof getIssue>>>>();
  const infos = new Map<string, Promise<Awaited<ReturnType<typeof getRepoInfo>>>>();
  const commitsIn = new Map<string, Promise<Awaited<ReturnType<typeof getCommit>>>>();
  const issueOf = (repo: string) => memo(issues, repo.toLowerCase(), () => getIssue(token, repo, n));
  const infoOf = (name: string) => memo(infos, name.toLowerCase(), () => getRepoInfo(token, name));
  const baseCommitIn = (repo: string) => memo(commitsIn, repo.toLowerCase(), () => getCommit(token, repo, target.baseSha));

  const key = `${createHash("sha256").update(token).digest("hex").slice(0, 24)}:${repoFullName}:${target.baseSha}:${target.headSha}:${n}`;
  const remembered = located.get(key);
  const rememberedIssue = remembered && Date.now() - remembered.at < LOCATED_TTL_MS ? issueOf(remembered.repo) : null;

  const commitMentions = await mentions(n);
  const baseEvidence = [`Issue number ${n} comes from the ${numberSource}.`];
  if (commitMentions) baseEvidence.push(`A pinned commit message mentions #${n}.`);

  const done = (requirement: Requirement | null): RequirementResolution => ({
    issueNumber,
    numberSource,
    attempts,
    commitMentions,
    requirement,
  });

  if (remembered && rememberedIssue) {
    const issue = await rememberedIssue;
    if (issue && !issue.isPullRequest) {
      attempts = remembered.attempts;
      return done({
        kind: "issue",
        issueRepo: remembered.repo,
        issue,
        manual: false,
        evidence: [...baseEvidence, ...remembered.extraEvidence],
      });
    }
    located.delete(key);
  }

  // Start everything that the steps below may need.
  const infoPromise = infoOf(repoFullName);
  const readmePromise = quiet(getReadme(token, repoFullName, target.headSha));
  void issueOf(repoFullName);
  void infoPromise.then((i) => {
    if (i?.parent) void issueOf(i.parent);
    if (i?.source) void issueOf(i.source);
  }, () => {});
  void readmePromise.then((readme) => {
    for (const linked of readme ? readmeRepoLinks(readme) : []) {
      void infoOf(linked).then((c) => {
        if (c) {
          void baseCommitIn(c.fullName);
          void issueOf(c.fullName);
        }
      }, () => {});
    }
  }, () => {});

  const tryRepo = async (repo: string, relation: string, extraEvidence: string[]): Promise<Requirement | null> => {
    const issue = await issueOf(repo);
    if (!issue) {
      attempts.push({ repo, relation, outcome: `no issue #${n}` });
      return null;
    }
    if (issue.isPullRequest) {
      attempts.push({ repo, relation, outcome: `#${n} is a pull request, not an issue` });
      return null;
    }
    attempts.push({ repo, relation, outcome: `found issue #${n}` });
    located.set(key, { at: Date.now(), repo, relation, extraEvidence, attempts: [...attempts] });
    return { kind: "issue", issueRepo: repo, issue, manual: false, evidence: [...baseEvidence, ...extraEvidence] };
  };

  // 1. The selected repository and its GitHub-registered fork chain.
  const info = await infoPromise;
  const seen = new Set<string>();
  const chain: [string, string, string[]][] = [[repoFullName, "selected repository", ["The issue is in the selected repository itself."]]];
  if (info?.parent) {
    chain.push([info.parent, "fork parent", [`GitHub records ${repoFullName} as a fork of ${info.parent}.`]]);
  }
  if (info?.source && info.source !== info.parent) {
    chain.push([info.source, "fork root", [`GitHub records ${info.source} as the root of this fork network.`]]);
  }
  for (const [repo, relation, evidence] of chain) {
    seen.add(repo.toLowerCase());
    const found = await tryRepo(repo, relation, evidence);
    if (found) return done(found);
  }

  // 2. Repositories the README links to, accepted only with shared Git history.
  const readme = await readmePromise;
  for (const linked of readme ? readmeRepoLinks(readme) : []) {
    // Resolves renames and redirects to the repository's current name.
    const candidate = await infoOf(linked);
    if (!candidate || seen.has(candidate.fullName.toLowerCase())) continue;
    seen.add(candidate.fullName.toLowerCase());
    const shared = await baseCommitIn(candidate.fullName);
    if (!shared) {
      attempts.push({
        repo: candidate.fullName,
        relation: "linked from README",
        outcome: "skipped: does not contain the pinned base commit",
      });
      continue;
    }
    const found = await tryRepo(candidate.fullName, "linked from README, shares Git history", [
      `GitHub does not record ${candidate.fullName} as a parent of ${repoFullName}; the README at the pinned head links to it.`,
      `${candidate.fullName} contains the pinned base commit ${target.baseSha.slice(0, 10)}, so the two repositories share Git history.`,
    ]);
    if (found) return done(found);
  }
  return done(null);
}
