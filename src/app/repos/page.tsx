import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { clearSelectedRepo, selectRepo, signOut } from "@/app/actions";
import {
  GitHubError,
  listInstallationRepos,
  listInstallations,
  type Installation,
  type Repo,
} from "@/lib/github";
import { getSession } from "@/lib/session";

export const metadata = { title: "Choose a repository · ProofMap" };

type SearchParams = Promise<{ error?: string }>;

export default function ReposPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
          ProofMap
        </Link>
      </header>
      <Suspense fallback={<p className="mt-16 text-sm text-foreground/60">Loading your repositories…</p>}>
        <RepoPicker searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function RepoPicker({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session) redirect("/?error=signed_out");
  const { error } = await searchParams;

  let groups: { installation: Installation; repos: Repo[] }[] = [];
  let loadError: string | null = null;
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

  const selected = session.selectedRepo;
  // The saved choice is only shown as valid while GitHub still lists it for this user.
  const selectedStillAccessible =
    selected !== null &&
    groups.some(
      (g) => g.installation.id === selected.installationId && g.repos.some((r) => r.id === selected.id),
    );

  return (
    <main className="mt-12 flex flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Signed in</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight" data-testid="user-name">
            {session.user.name ?? session.user.login}
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            @{session.user.login} · GitHub user ID {session.user.id}
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="h-9 rounded-full border border-foreground/15 px-4 text-sm hover:bg-foreground/5"
          >
            Sign out
          </button>
        </form>
      </div>

      {error === "invalid_selection" && (
        <p role="alert" className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
          That repository is not available to you through the ProofMap app, so it was not selected.
        </p>
      )}
      {loadError && (
        <p role="alert" className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
          {loadError}
        </p>
      )}

      <section className="mt-8 rounded-2xl border border-foreground/10 p-5" data-testid="selected-repo">
        <h2 className="text-sm font-semibold">Selected repository</h2>
        {selected ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <a href={selected.htmlUrl} target="_blank" rel="noreferrer" className="font-mono text-sm underline">
                {selected.fullName}
              </a>
              <p className="mt-1 text-xs text-foreground/60">
                Repository ID {selected.id} · installation {selected.installationId} · default branch{" "}
                {selected.defaultBranch} · {selected.private ? "private" : "public"}
              </p>
              {!loadError && !selectedStillAccessible && (
                <p className="mt-2 text-xs text-red-500">
                  GitHub no longer lists this repository for you through the app. Choose another one.
                </p>
              )}
            </div>
            <form action={clearSelectedRepo}>
              <button type="submit" className="text-xs text-foreground/60 underline">
                Clear
              </button>
            </form>
          </div>
        ) : (
          <p className="mt-2 text-sm text-foreground/60">None yet. Choose one below.</p>
        )}
      </section>

      <div className="mt-10 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold">Repositories you can access through the app</h2>
        <a href="/api/github/install" className="text-sm text-accent underline">
          Install on another account
        </a>
      </div>

      {!loadError && groups.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-foreground/20 p-6 text-sm">
          <p>The ProofMap app is not installed on any account or repository you can access.</p>
          <a
            href="/api/github/install"
            className="mt-4 inline-flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
          >
            Install the app on a repository
          </a>
        </div>
      )}

      {groups.map(({ installation, repos }) => (
        <section key={installation.id} className="mt-4 rounded-2xl border border-foreground/10">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 px-5 py-3">
            <p className="text-sm">
              <span className="font-semibold">{installation.accountLogin}</span>{" "}
              <span className="text-foreground/50">
                · {installation.repositorySelection === "all" ? "all repositories" : "selected repositories"}
              </span>
            </p>
            <a href={installation.manageUrl} target="_blank" rel="noreferrer" className="text-xs text-accent underline">
              Add or remove repositories on GitHub
            </a>
          </div>
          {repos.length === 0 ? (
            <p className="px-5 py-4 text-sm text-foreground/60">No repositories granted in this installation.</p>
          ) : (
            <ul>
              {repos.map((repo) => {
                const isSelected = selected?.id === repo.id;
                return (
                  <li
                    key={repo.id}
                    className="flex items-center justify-between gap-4 border-b border-foreground/5 px-5 py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm">{repo.fullName}</p>
                      <p className="truncate text-xs text-foreground/55">
                        {repo.private ? "Private" : "Public"} · {repo.defaultBranch}
                        {repo.description ? ` · ${repo.description}` : ""}
                      </p>
                    </div>
                    {isSelected ? (
                      <span className="shrink-0 rounded-full border border-accent px-3 py-1 text-xs text-accent">
                        Selected
                      </span>
                    ) : (
                      <form action={selectRepo} className="shrink-0">
                        <input type="hidden" name="installationId" value={installation.id} />
                        <input type="hidden" name="repoId" value={repo.id} />
                        <button
                          type="submit"
                          className="h-8 rounded-full bg-foreground px-4 text-xs font-medium text-background"
                        >
                          Select
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      <p className="mt-6 text-xs text-foreground/50">
        After changing repository access on GitHub, come back and{" "}
        <Link href="/repos" className="underline">
          refresh this list
        </Link>
        .
      </p>
    </main>
  );
}
