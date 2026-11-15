"use client";

import { useMemo, useState } from "react";
import { clearSelectedRepo, selectRepo } from "@/app/actions";
import { RepoIcon, SearchIcon, StarIcon } from "@/components/icons";

export type RepoRow = {
  id: number;
  installationId: number;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  fork: boolean;
  description: string | null;
  language: string | null;
  stars: number;
  pushedAt: string | null;
  /** "2 hours ago", worked out on the server from GitHub's last-push time. */
  pushedLabel: string | null;
  defaultBranch: string;
  ownerId: number;
};

// Colours for the languages most likely to appear; anything else gets a neutral dot.
const LANGUAGE_COLOR: Record<string, string> = {
  "C#": "#a371f7",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  Go: "#00add8",
  Rust: "#dea584",
  Java: "#b07219",
  HTML: "#e34c26",
  CSS: "#663399",
};

const selectClass = "btn cursor-pointer appearance-none pr-3 font-semibold";

/** The repository list with a working name filter, type and language filters, and sort. */
export function RepoList({ repos, selectedId, showOwner }: { repos: RepoRow[]; selectedId: number | null; showOwner: boolean }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [language, setLanguage] = useState("all");
  const [sort, setSort] = useState("pushed");
  const languages = useMemo(() => [...new Set(repos.map((r) => r.language).filter((l): l is string => l !== null))].sort(), [repos]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = repos.filter(
      (r) =>
        (q === "" || r.fullName.toLowerCase().includes(q)) &&
        (type === "all" || (type === "private" ? r.private : type === "public" ? !r.private : r.fork)) &&
        (language === "all" || r.language === language),
    );
    const name = (r: RepoRow) => r.fullName.split("/")[1] ?? r.fullName;
    return list.sort((a, b) =>
      sort === "name"
        ? name(a).localeCompare(name(b))
        : sort === "stars"
          ? b.stars - a.stars
          : (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""),
    );
  }, [repos, query, type, language, sort]);

  return (
    <section className="box" data-testid="repo-list">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <h2 className="mr-auto text-base font-semibold">
          {repos.length} {repos.length === 1 ? "repository" : "repositories"}
        </h2>
        <label className="relative min-w-0 flex-1 basis-56 sm:max-w-[240px]">
          <span className="sr-only">Find a repository</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a repository…"
            className="input h-8 pl-9"
          />
        </label>
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
          <option value="all">Type: all</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
          <option value="fork">Forks</option>
        </select>
        <select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value)} className={selectClass}>
          <option value="all">Language: all</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className={selectClass}>
          <option value="pushed">Sort: last pushed</option>
          <option value="name">Name</option>
          <option value="stars">Stars</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="border-t border-line px-4 py-6 text-sm text-muted">No repository matches these filters.</p>
      ) : (
        <ul>
          {shown.map((repo) => {
            const [owner, name] = repo.fullName.split("/");
            const isSelected = repo.id === selectedId;
            return (
              <li key={repo.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-4">
                <RepoIcon className="hidden h-5 w-5 shrink-0 self-start text-muted sm:block" />
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <a href={repo.htmlUrl} target="_blank" rel="noreferrer" className="break-all text-base font-semibold text-accent hover:underline">
                      {showOwner ? `${owner}/` : ""}
                      {name ?? repo.fullName}
                    </a>
                    <span className="pill text-foreground">{repo.private ? "Private" : "Public"}</span>
                    {repo.fork && <span className="pill">Fork</span>}
                    {isSelected && <span className="pill pill-success">Selected</span>}
                  </p>
                  <p className="mt-1 text-sm text-muted">{repo.description ?? `Default branch ${repo.defaultBranch}`}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted">
                  {repo.language && (
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full" style={{ background: LANGUAGE_COLOR[repo.language] ?? "var(--muted)" }} />
                      {repo.language}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5" title="Stars on GitHub">
                    <StarIcon /> {repo.stars}
                  </span>
                  {repo.pushedLabel && <span>Updated {repo.pushedLabel}</span>}
                </div>
                {isSelected ? (
                  <form action={clearSelectedRepo} className="shrink-0">
                    <button type="submit" className="btn">
                      Clear
                    </button>
                  </form>
                ) : (
                  <form action={selectRepo} className="shrink-0">
                    <input type="hidden" name="installationId" value={repo.installationId} />
                    <input type="hidden" name="repoId" value={repo.id} />
                    <button type="submit" className="btn" aria-label={`Select ${repo.fullName}`}>
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
  );
}
