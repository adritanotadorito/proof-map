import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pinTarget } from "@/app/actions";
import { GitHubError, getRepoInfo, listBranches, listOpenPulls, type Branch, type Pull } from "@/lib/github";
import { issueNumberFromRef } from "@/lib/requirement";
import { getSession } from "@/lib/session";

export const metadata = { title: "Choose a change · ProofMap" };

type SearchParams = Promise<{ error?: string }>;

const errors: Record<string, string> = {
  invalid: "That selection was not valid. Choose a branch or pull request from the list.",
  not_found: "GitHub could not find that branch or pull request, or it has nothing to compare. Nothing was pinned.",
  github: "GitHub returned an error while pinning the change. Try again.",
};

export default function TargetPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6">
      <Suspense fallback={<p className="mt-16 text-sm text-muted">Loading branches and pull requests…</p>}>
        <TargetPicker searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const selectButton = "btn btn-sm btn-primary shrink-0";

async function TargetPicker({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session) redirect("/?error=signed_out");
  const repo = session.selectedRepo;
  if (!repo) redirect("/repos");
  const { error } = await searchParams;

  let branches: Branch[] = [];
  let pulls: Pull[] = [];
  let defaultBranch = repo.defaultBranch;
  let loadError: string | null = null;
  try {
    const [info, b, p] = await Promise.all([
      getRepoInfo(session.accessToken, repo.fullName),
      listBranches(session.accessToken, repo.fullName),
      listOpenPulls(session.accessToken, repo.fullName),
    ]);
    if (info) defaultBranch = info.defaultBranch;
    // Branches that name an issue come first: they are the likeliest review targets.
    branches = b
      .map((branch) => ({ branch, issue: issueNumberFromRef(branch.name) }))
      .sort((x, y) => Number(y.issue !== null) - Number(x.issue !== null) || x.branch.name.localeCompare(y.branch.name))
      .map((x) => x.branch);
    pulls = p;
  } catch (e) {
    loadError =
      e instanceof GitHubError && e.status === 401
        ? "GitHub no longer accepts this session. Sign out and sign in again."
        : "Could not load branches and pull requests from GitHub. Try refreshing the page.";
  }

  const pinned = session.target;

  return (
    <main>
      <p className="eyebrow">Choose a change</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        <a href={repo.htmlUrl} target="_blank" rel="noreferrer" className="font-mono underline">
          {repo.fullName}
        </a>
      </h1>
      <p className="mt-2 text-sm text-muted">
        Pick an open pull request or a branch. ProofMap pins the exact base and head commits, so everything shown
        afterwards refers to one fixed change.
      </p>

      {error && errors[error] && (
        <p role="alert" className="mt-6 flash flash-danger">
          {errors[error]}
        </p>
      )}
      {loadError && (
        <p role="alert" className="mt-6 flash flash-danger">
          {loadError}
        </p>
      )}

      {pinned && (
        <p className="mt-6 flash flash-accent">
          Currently pinned: <span className="font-mono">{pinned.kind === "pr" ? `PR #${pinned.prNumber}` : pinned.ref}</span>{" "}
          at <span className="font-mono">{pinned.headSha.slice(0, 10)}</span>.{" "}
          <Link href="/change" className="link">
            Open it
          </Link>
        </p>
      )}

      <section className="mt-8 box" data-testid="pulls">
        <h2 className="box-head">
          Open pull requests <span className="font-normal text-muted">· {pulls.length}</span>
        </h2>
        {pulls.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted">This repository has no open pull requests.</p>
        ) : (
          <ul>
            {pulls.map((pull) => (
              <li key={pull.number} className="box-row flex items-center justify-between gap-4 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    <span className="font-mono text-muted">#{pull.number}</span> {pull.title}
                  </p>
                  <p className="truncate font-mono text-xs text-muted">
                    {pull.headRef} → {pull.baseRef} · @{pull.author} · {pull.headSha.slice(0, 10)}
                  </p>
                </div>
                <form action={pinTarget}>
                  <input type="hidden" name="kind" value="pr" />
                  <input type="hidden" name="number" value={pull.number} />
                  <button type="submit" className={selectButton}>
                    Select
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 box" data-testid="branches">
        <h2 className="box-head">
          Branches <span className="font-normal text-muted">· {branches.length}</span>
        </h2>
        <ul>
          {branches.map((branch) => {
            const issue = issueNumberFromRef(branch.name);
            return (
              <li key={branch.name} className="box-row flex items-center justify-between gap-4 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{branch.name}</p>
                  <p className="truncate text-xs text-muted">
                    <span className="font-mono">{branch.sha.slice(0, 10)}</span>
                    {branch.name === defaultBranch ? " · default branch" : ""}
                    {issue !== null ? ` · names issue #${issue}` : ""}
                  </p>
                </div>
                <form action={pinTarget}>
                  <input type="hidden" name="kind" value="branch" />
                  <input type="hidden" name="branch" value={branch.name} />
                  <button type="submit" className={selectButton} aria-label={`Select branch ${branch.name}`}>
                    Select
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
