import "server-only";
import { compare, getBranch, getCommit, getPull, getRepoInfo } from "./github";
import type { PinnedTarget } from "./session";

export type PinResult = { ok: true; target: PinnedTarget } | { ok: false; reason: string };

export type PinMode = "auto" | "head-commit";

/**
 * Decides which commits on a branch are "the change", and pins a base and head SHA.
 * A branch has no built-in base the way a pull request does, so the rule used is
 * recorded in words and shown to the reviewer.
 */
export async function pinBranch(
  token: string,
  repoFullName: string,
  branchName: string,
  mode: PinMode,
): Promise<PinResult> {
  const [repo, branch] = await Promise.all([
    getRepoInfo(token, repoFullName),
    getBranch(token, repoFullName, branchName),
  ]);
  if (!repo) return { ok: false, reason: "The repository could not be read." };
  if (!branch) return { ok: false, reason: `Branch "${branchName}" was not found.` };

  const head = await getCommit(token, repoFullName, branch.sha);
  if (!head) return { ok: false, reason: "The branch's head commit could not be read." };

  const pin = (baseSha: string, baseRule: string): PinResult => ({
    ok: true,
    target: {
      kind: "branch",
      ref: branch.name,
      prNumber: null,
      prTitle: null,
      baseSha,
      headSha: head.sha,
      baseRule,
      pinnedAt: new Date().toISOString(),
    },
  });

  const headVsParent = (why: string): PinResult => {
    if (head.parents.length === 0) {
      return { ok: false, reason: "The head commit has no parent, so there is nothing to compare it with." };
    }
    const merge = head.parents.length > 1 ? " It is a merge commit; its first parent is used." : "";
    return pin(head.parents[0], `${why} The head commit is compared with its parent.${merge}`);
  };

  if (mode === "head-commit") return headVsParent("You chose to review only the head commit.");
  if (branch.name === repo.defaultBranch) return headVsParent("This is the default branch.");

  const cmp = await compare(token, repoFullName, repo.defaultBranch, head.sha);
  if (!cmp || cmp.aheadBy === 0) {
    return headVsParent(`The branch has no commits beyond the default branch (${repo.defaultBranch}).`);
  }
  if (cmp.aheadBy === 1 && cmp.commits.length === 1 && cmp.commits[0].sha === head.sha) {
    return headVsParent(
      `The branch is exactly one commit ahead of the default branch (${repo.defaultBranch}), so that commit is the change.`,
    );
  }
  return pin(
    cmp.mergeBaseSha,
    `The branch is ${cmp.aheadBy} commits ahead of the default branch (${repo.defaultBranch}). The base is where the two diverged, so all ${cmp.aheadBy} commits are included.`,
  );
}

export async function pinPull(token: string, repoFullName: string, number: number): Promise<PinResult> {
  const pull = await getPull(token, repoFullName, number);
  if (!pull) return { ok: false, reason: `Pull request #${number} was not found.` };
  const cmp = await compare(token, repoFullName, pull.baseSha, pull.headSha);
  if (!cmp) return { ok: false, reason: "GitHub could not compare the pull request's base and head." };
  return {
    ok: true,
    target: {
      kind: "pr",
      ref: pull.headRef,
      prNumber: pull.number,
      prTitle: pull.title,
      baseSha: cmp.mergeBaseSha,
      headSha: pull.headSha,
      baseRule: `Pull request #${pull.number} into ${pull.baseRef}. The base is where the pull request's branch diverged from ${pull.baseRef}.`,
      pinnedAt: new Date().toISOString(),
    },
  };
}

/** The live head SHA of the pinned branch or pull request, to detect a stale pin. Null if it is gone. */
export async function currentHeadSha(
  token: string,
  repoFullName: string,
  target: PinnedTarget,
): Promise<string | null> {
  if (target.kind === "pr" && target.prNumber !== null) {
    return (await getPull(token, repoFullName, target.prNumber))?.headSha ?? null;
  }
  return (await getBranch(token, repoFullName, target.ref))?.sha ?? null;
}
