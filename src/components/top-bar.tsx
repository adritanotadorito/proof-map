import Link from "next/link";
import { signOut } from "@/app/actions";
import { getGitHubConfig } from "@/lib/github";
import { getSession, type Session } from "@/lib/session";
import { BranchIcon, ProofMapMark, RepoIcon } from "./icons";

/** The bar itself, free of data fetching so it can be rendered with any session. */
export function TopBarView({ session }: { session: Session | null }) {
  const repo = session?.selectedRepo ?? null;
  const target = session?.target ?? null;
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-14 w-full max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <ProofMapMark className="text-brand" />
          ProofMap
        </Link>

        {session && (
          <nav aria-label="Current selection" className="order-last flex min-w-0 basis-full items-center gap-1.5 text-sm sm:order-none sm:flex-1 sm:basis-0">
            <span className="hidden text-muted sm:inline">/</span>
            {repo ? (
              <Link href="/repos" className="flex min-w-0 items-center gap-1.5 hover:underline" title="Change repository">
                <RepoIcon className="shrink-0 text-muted" />
                <span className="truncate">{repo.fullName}</span>
              </Link>
            ) : (
              <Link href="/repos" className="link">
                Choose a repository
              </Link>
            )}
            {repo && (
              <>
                <span className="text-muted">/</span>
                {target ? (
                  <Link href="/target" className="flex min-w-0 items-center gap-1.5 hover:underline" title="Change branch or pull request">
                    <BranchIcon className="shrink-0 text-muted" />
                    <span className="truncate font-mono text-xs">
                      {target.kind === "pr" ? `#${target.prNumber} ${target.ref}` : target.ref}
                    </span>
                  </Link>
                ) : (
                  <Link href="/target" className="link whitespace-nowrap">
                    Choose a change
                  </Link>
                )}
              </>
            )}
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
          {session ? (
            <>
              <span className="hidden text-muted sm:inline" title={`GitHub user ID ${session.user.id}`}>
                @{session.user.login}
              </span>
              <form action={signOut}>
                <button type="submit" className="btn btn-sm">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <span className="pill">Reference implementation</span>
          )}
        </div>
      </div>
    </header>
  );
}

export async function TopBar() {
  const session = getGitHubConfig() ? await getSession() : null;
  return <TopBarView session={session} />;
}
