"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BranchIcon, RepoIcon, ReviewIcon } from "./icons";

type Props = {
  login: string;
  repo: { fullName: string; private: boolean } | null;
  hasTarget: boolean;
};

/** Where you are: the account or repository, as in a code host's header. */
export function Breadcrumb({ login, repo }: Props) {
  const pathname = usePathname();
  const onRepos = pathname === "/repos" || !repo;
  const [owner, name] = repo ? repo.fullName.split("/") : [login, ""];
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
      {onRepos ? (
        <>
          <span className="truncate">{login}</span>
          <span className="text-muted">/</span>
          <Link href="/repos" className="font-semibold hover:underline">
            repositories
          </Link>
        </>
      ) : (
        <>
          <Link href="/repos" className="hidden truncate hover:underline sm:inline" title="All repositories">
            {owner}
          </Link>
          <span className="hidden text-muted sm:inline">/</span>
          <Link href="/target" className="truncate font-semibold text-accent hover:underline" title="Branches and pull requests">
            {name}
          </Link>
          <span className="pill hidden text-foreground sm:inline-flex">{repo.private ? "Private" : "Public"}</span>
        </>
      )}
    </nav>
  );
}

/** The three places a signed-in person works in, in order. */
export function SectionNav({ repo, hasTarget }: Props) {
  const pathname = usePathname();
  const items = [
    { href: "/repos", label: "Repositories", icon: <RepoIcon />, enabled: true },
    { href: "/target", label: "Branches and pull requests", icon: <BranchIcon />, enabled: Boolean(repo) },
    { href: "/change", label: "Review", icon: <ReviewIcon />, enabled: Boolean(repo) && hasTarget },
  ];
  return (
    <nav aria-label="Sections" className="topbar-inner mx-auto flex w-full max-w-[1280px] gap-2 overflow-x-auto px-2 sm:px-4" style={{ scrollbarWidth: "none" }}>
      {items.map((item) =>
        item.enabled ? (
          <Link key={item.href} href={item.href} className="navtab" aria-current={pathname.startsWith(item.href) ? "page" : undefined}>
            <span className="text-muted">{item.icon}</span>
            {item.label}
          </Link>
        ) : (
          <span key={item.href} className="navtab" aria-disabled="true">
            {item.icon}
            {item.label}
          </span>
        ),
      )}
    </nav>
  );
}
