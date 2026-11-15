import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { selectRepo } from "@/app/actions";
import { Heatmap, activitySummary, heatmapStart } from "@/components/heatmap";
import { ExternalIcon } from "@/components/icons";
import { loadActivity } from "@/lib/activity";
import { GitHubError, listInstallationRepos, listInstallations, type Installation, type Repo } from "@/lib/github";
import { getSession } from "@/lib/session";
import { RepoList, type RepoRow } from "./repo-list";

export const metadata = { title: "Choose a repository · ProofMap" };

type SearchParams = Promise<{ error?: string }>;

export default function ReposPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-sm text-muted">Loading your repositories…</p>}>
      <ReposPicker searchParams={searchParams} />
    </Suspense>
  );
}

function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  const say = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (minutes < 1) return "just now";
  if (minutes < 60) return say(minutes, "minute");
  if (minutes < 60 * 24) return say(Math.round(minutes / 60), "hour");
  if (minutes < 60 * 24 * 30) return say(Math.round(minutes / (60 * 24)), "day");
  if (minutes < 60 * 24 * 365) return say(Math.round(minutes / (60 * 24 * 30)), "month");
  return say(Math.round(minutes / (60 * 24 * 365)), "year");
}

function Installations({ groups }: { groups: { installation: Installation; repos: Repo[] }[] }) {
  return (
    <>
      <h2 className="text-sm font-semibold">Installations</h2>
      <ul className="mt-2 grid gap-2 text-[13px]">
        {groups.map(({ installation, repos }) => (
          <li key={installation.id}>
            <span className="font-medium">{installation.accountLogin}</span>
            <span className="block text-xs text-muted">
              {installation.repositorySelection === "all" ? "all repositories" : `${repos.length} selected`} ·{" "}
              <a href={installation.manageUrl} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                manage on GitHub <ExternalIcon className="h-3 w-3" />
              </a>
            </span>
          </li>
        ))}
      </ul>
      <a href="/api/github/install" className="link mt-3 inline-block text-[13px]">
        Install on another account
      </a>
    </>
  );
}

async function ReposPicker({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session) redirect("/?error=signed_out");
  const { error } = await searchParams;
  // getSession has already waited for the request, so reading the clock here is allowed.
  const now = new Date().getTime();
  const today = new Date(now).toISOString().slice(0, 10);

  let groups: { installation: Installation; repos: Repo[] }[] = [];
  let loadError: string | null = null;
  const activityPromise = loadActivity(session.user.login, heatmapStart(today));
  try {
    const installations = await listInstallations(session.accessToken);
    groups = await Promise.all(
      installations.map(async (installation) => ({
        installation,
        repos: await listInstallationRepos(session.accessToken, installation.id),
      })),
    );
  } catch (e) {
    loadError =
      e instanceof GitHubError && e.status === 401
        ? "GitHub no longer accepts this session. Sign out and sign in again."
        : "Could not load repositories from GitHub. Try refreshing the page.";
  }
  const activity = await activityPromise;

  const rows: RepoRow[] = groups
    .flatMap(({ installation, repos }) =>
      repos.map((r) => ({
        id: r.id,
        installationId: installation.id,
        fullName: r.fullName,
        htmlUrl: r.htmlUrl,
        private: r.private,
        fork: r.fork,
        description: r.description,
        language: r.language,
        stars: r.stars,
        pushedAt: r.pushedAt,
        pushedLabel: r.pushedAt ? ago(r.pushedAt, now) : null,
        defaultBranch: r.defaultBranch,
        ownerId: r.ownerId,
      })),
    )
    .sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
  const owners = new Set(rows.map((r) => r.fullName.split("/")[0]));
  const selected = session.selectedRepo;
  const selectedStillAccessible = selected !== null && rows.some((r) => r.id === selected.id && r.installationId === selected.installationId);

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[268px] shrink-0 border-r border-line bg-inset px-5 py-6 lg:block">
        <h2 className="text-sm font-semibold">Recently pushed</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-xs text-muted">No repositories yet.</p>
        ) : (
          <ul className="-mx-2 mt-2 grid gap-0.5">
            {rows.slice(0, 7).map((r) => (
              <li key={r.id}>
                <form action={selectRepo}>
                  <input type="hidden" name="installationId" value={r.installationId} />
                  <input type="hidden" name="repoId" value={r.id} />
                  <button type="submit" className="tree-item text-sm" data-active={r.id === selected?.id} title={`Select ${r.fullName}`}>
                    <span className="avatar h-5 w-5 !rounded-[5px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://avatars.githubusercontent.com/u/${r.ownerId}?s=40&v=4`} alt="" width={20} height={20} />
                    </span>
                    <span className="truncate">{r.fullName.split("/")[1] ?? r.fullName}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {!loadError && (
          <div className="mt-6 border-t border-line pt-5">
            <Installations groups={groups} />
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">
        <div className="grid max-w-[1100px] grid-cols-1 gap-5">
          {error === "invalid_selection" && (
            <p role="alert" className="flash flash-danger">
              That repository is not available to you through the ProofMap app, so it was not selected.
            </p>
          )}
          {loadError && (
            <p role="alert" className="flash flash-danger">
              {loadError}
            </p>
          )}

          <section className="box p-5" aria-label="Review activity" data-testid="activity">
            <h2 className="text-base font-semibold">{activitySummary(activity.reviews, activity.decisions)}</h2>
            <div className="mt-4">
              <Heatmap days={activity.days} today={today} />
            </div>
          </section>

          {!loadError && rows.length === 0 && (
            <div className="box p-6 text-sm">
              <p className="text-muted">The ProofMap app is not installed on any account or repository you can access.</p>
              <a href="/api/github/install" className="btn btn-primary mt-4">
                Install the app on a repository
              </a>
            </div>
          )}

          {rows.length > 0 && <RepoList repos={rows} selectedId={selected?.id ?? null} showOwner={owners.size > 1} />}

          {selected && selectedStillAccessible && (
            <div>
              <Link href="/target" className="btn btn-primary">
                Choose a pull request or branch in {selected.fullName.split("/")[1]} →
              </Link>
            </div>
          )}

          {!loadError && (
            <div className="lg:hidden">
              <Installations groups={groups} />
            </div>
          )}

          <p className="text-xs text-muted">
            After changing repository access on GitHub,{" "}
            <Link href="/repos" className="underline">
              refresh this list
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
