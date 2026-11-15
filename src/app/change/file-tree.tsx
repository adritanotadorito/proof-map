"use client";

import { useState } from "react";
import { ChevronIcon, FileIcon, FolderIcon, SearchIcon } from "@/components/icons";

export type TreeFile = { path: string; index: number; additions: number; deletions: number; notes: number };
type Dir = { dirs: Map<string, Dir>; files: (TreeFile & { name: string })[] };

function build(files: TreeFile[]): Dir {
  const root: Dir = { dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      if (!dir.dirs.has(part)) dir.dirs.set(part, { dirs: new Map(), files: [] });
      dir = dir.dirs.get(part)!;
    }
    dir.files.push({ ...f, name: parts[parts.length - 1] });
  }
  return root;
}

/** The changed files as a folder tree. Each file jumps to its diff on the same tab. */
export function FileTree({ files }: { files: TreeFile[] }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<number | null>(files[0]?.index ?? null);
  const q = query.trim().toLowerCase();

  const fileLink = (f: TreeFile, label: string) => (
    <a
      key={f.path}
      href={`/change?tab=files#file-${f.index}`}
      className="tree-item"
      data-active={active === f.index}
      onClick={() => setActive(f.index)}
      title={`${f.path} · +${f.additions} −${f.deletions}`}
    >
      <FileIcon className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {f.notes > 0 && (
        <span className="counter shrink-0 text-done" title={`${f.notes} AI statement${f.notes === 1 ? "" : "s"} placed in this diff`}>
          {f.notes}
        </span>
      )}
    </a>
  );

  const renderDir = (dir: Dir, depth: number): React.ReactNode => (
    <>
      {[...dir.dirs.entries()].map(([name, child]) => (
        <details key={name} open className="group/dir">
          <summary className="tree-item list-none [&::-webkit-details-marker]:hidden" style={{ paddingLeft: 8 + depth * 14 }}>
            <ChevronIcon className="shrink-0 -rotate-90 text-muted transition-transform group-open/dir:rotate-0" />
            <FolderIcon className="shrink-0 text-muted" />
            <span className="truncate">{name}</span>
          </summary>
          {renderDir(child, depth + 1)}
        </details>
      ))}
      {dir.files.map((f) => (
        <div key={f.path} style={{ paddingLeft: 22 + depth * 14 }}>
          {fileLink(f, f.name)}
        </div>
      ))}
    </>
  );

  const matches = q ? files.filter((f) => f.path.toLowerCase().includes(q)) : [];
  return (
    <nav aria-label="Changed files" data-testid="file-tree">
      <label className="relative block">
        <span className="sr-only">Filter files</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter files…" className="input h-8 pl-9" />
      </label>
      <div className="mt-3 grid gap-0.5">
        {q ? (
          matches.length ? (
            matches.map((f) => fileLink(f, f.path))
          ) : (
            <p className="px-2 py-1 text-xs text-muted">No changed file matches.</p>
          )
        ) : (
          renderDir(build(files), 0)
        )}
      </div>
    </nav>
  );
}
