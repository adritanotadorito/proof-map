import Link from "next/link";
import { signOut } from "@/app/actions";
import { getGitHubConfig } from "@/lib/github";
import { getSession, type Session } from "@/lib/session";
import { ChevronIcon, ProofMapMark } from "./icons";
import { Breadcrumb, SectionNav } from "./top-nav";

/** A signed-in person's GitHub avatar, addressed by their numeric GitHub ID. */
export function Avatar({ userId, size, className }: { userId: number; size: number; className?: string }) {
  return (
    <span className={`avatar ${className ?? ""}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://avatars.githubusercontent.com/u/${userId}?s=${size * 2}&v=4`} alt="" width={size} height={size} />
    </span>
  );
}

/** The bar itself, free of data fetching so it can be rendered with any session. */
export function TopBarView({ session }: { session: Session | null }) {
  const nav = session
    ? {
        login: session.user.login,
        repo: session.selectedRepo ? { fullName: session.selectedRepo.fullName, private: session.selectedRepo.private } : null,
        hasTarget: Boolean(session.target),
      }
    : null;
  return (
    <header className="border-b border-line bg-inset">
      <div className="topbar-inner mx-auto flex h-[54px] w-full max-w-[1280px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-3 text-base font-semibold">
          <ProofMapMark size={28} />
          <span className={nav ? "sr-only" : undefined}>ProofMap</span>
        </Link>

        {nav && <Breadcrumb {...nav} />}

        <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
          {session ? (
            <details className="relative">
              <summary
                className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden"
                aria-label={`Account menu for @${session.user.login}`}
              >
                <Avatar userId={session.user.id} size={32} />
                <ChevronIcon className="text-muted" />
              </summary>
              <div className="box absolute right-0 z-20 mt-2 w-56 p-2 shadow-lg shadow-black/40">
                <p className="px-2 py-1.5 text-[13px] text-muted">
                  Signed in as <span className="font-semibold text-foreground">@{session.user.login}</span>
                  <span className="block text-xs">GitHub user ID {session.user.id}</span>
                </p>
                <form action={signOut} className="mt-1 border-t border-line pt-2">
                  <button type="submit" className="tree-item">
                    Sign out
                  </button>
                </form>
              </div>
            </details>
          ) : (
            <a href="/api/auth/github/login" className="btn bg-transparent px-3.5 font-medium">
              Sign in
            </a>
          )}
        </div>
      </div>
      {nav && <SectionNav {...nav} />}
    </header>
  );
}

export async function TopBar() {
  const session = getGitHubConfig() ? await getSession() : null;
  return <TopBarView session={session} />;
}
