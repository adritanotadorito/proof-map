import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ScrollToLine } from "@/components/scroll-to-line";
import { GitHubError, compare, getFileAtRef } from "@/lib/github";
import { addedLines, splitLines } from "@/lib/patch";
import { getSession } from "@/lib/session";

export const metadata = { title: "Source at pinned head · ProofMap" };

type SearchParams = Promise<{ path?: string; start?: string; end?: string }>;

export default function SourcePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-4 py-6 sm:px-6">
      <p className="text-sm">
        <Link href="/change" className="link">
          ← Back to the review
        </Link>
        <span className="text-muted"> · </span>
        <Link href="/change?tab=files" className="link">
          Files changed
        </Link>
      </p>
      <Suspense fallback={<p className="mt-16 text-sm text-muted">Reading the file at the pinned commit…</p>}>
        <Source searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Source({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session) redirect("/?error=signed_out");
  const { selectedRepo: repo, target } = session;
  if (!repo) redirect("/repos");
  if (!target) redirect("/target");
  const params = await searchParams;
  const path = params.path ?? "";
  const start = Math.max(1, Number.parseInt(params.start ?? "1", 10) || 1);
  const end = Math.max(start, Number.parseInt(params.end ?? String(start), 10) || start);

  let content: string | null = null;
  let added = new Set<number>();
  let loadError: string | null = null;
  try {
    const [file, cmp] = await Promise.all([
      getFileAtRef(session.accessToken, repo.fullName, path, target.headSha),
      compare(session.accessToken, repo.fullName, target.baseSha, target.headSha),
    ]);
    content = file;
    const patch = cmp?.files.find((f) => f.filename === path)?.patch;
    if (patch) added = new Set(addedLines(patch));
  } catch (e) {
    loadError =
      e instanceof GitHubError && e.status === 401
        ? "GitHub no longer accepts this session. Sign out and sign in again."
        : "Could not read the file from GitHub. Try refreshing the page.";
  }

  const lines = content === null ? [] : splitLines(content);
  const githubUrl = `${repo.htmlUrl}/blob/${target.headSha}/${path.split("/").map(encodeURIComponent).join("/")}#L${start}-L${end}`;
  const inBounds = end <= lines.length;

  return (
    <main className="mt-5">
      <p className="eyebrow">Source at pinned head</p>
      <h1 className="mt-2 break-all font-mono text-lg font-semibold">{path || "(no path)"}</h1>
      <p className="mt-1 text-sm text-muted">
        <span className="font-mono">{repo.fullName}</span> at <span className="font-mono">{target.headSha}</span> · cited
        lines {start}
        {end !== start ? `–${end}` : ""} ·{" "}
        <a href={githubUrl} target="_blank" rel="noreferrer" className="link">
          same lines on GitHub
        </a>
      </p>
      <p className="mt-2 text-xs text-muted">
        <span className="rounded bg-cite px-1.5 py-0.5">Highlighted</span> lines are the citation.{" "}
        <span className="rounded bg-diff-add px-1.5 py-0.5">Green</span> lines were added by the pinned change.
      </p>

      {loadError && (
        <p role="alert" className="mt-6 flash flash-danger">
          {loadError}
        </p>
      )}
      {!loadError && content === null && (
        <p role="alert" className="mt-6 flash flash-danger">
          No readable text file exists at this path in the pinned head commit.
        </p>
      )}
      {content !== null && !inBounds && (
        <p role="alert" className="mt-6 flash flash-danger">
          The file has {lines.length} lines at this commit, so lines {start}–{end} do not all exist.
        </p>
      )}

      {content !== null && (
        <div className="box mt-5 overflow-x-auto">
          <table className="w-full border-collapse font-mono text-xs leading-5" data-testid="source">
            <tbody>
              {lines.map((text, i) => {
                const n = i + 1;
                const cited = n >= start && n <= end;
                return (
                  <tr
                    key={n}
                    id={`L${n}`}
                    data-cited={cited || undefined}
                    className={cited ? "bg-cite" : added.has(n) ? "bg-diff-add" : undefined}
                  >
                    <td className="w-14 select-none px-3 text-right text-muted">{n}</td>
                    <td className="w-4 select-none text-center text-muted">{added.has(n) ? "+" : ""}</td>
                    <td className="whitespace-pre pr-4">{text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ScrollToLine id={`L${start}`} />
        </div>
      )}
    </main>
  );
}
