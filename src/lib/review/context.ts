import "server-only";
import { getFileAtRef, getReadme, type Comparison } from "../github";
import { hunkRanges, numberedPatch, padAndMerge, splitLines } from "../patch";
import type { Requirement } from "../requirement";
import type { PinnedTarget } from "../session";
import { classifyFile, type FileKind } from "./classify";
import type { ContextSource } from "./types";

/** Hard limits that keep the prompt bounded whatever the size of the change. */
const MAX_TOTAL_CHARS = 160_000;
const MAX_REQUIREMENT_CHARS = 12_000;
const MAX_README_CHARS = 5_000;
const MAX_PATCH_CHARS = 24_000;
const MAX_FILE_WINDOW_CHARS = 40_000;
const MAX_FILES_FETCHED = 14;
const SOURCE_PAD = 40;
const TEST_PAD = 12;

export type ReviewContext = {
  requirementId: string;
  requirementText: string;
  prompt: string;
  sources: ContextSource[];
  omissions: string[];
  /** Files already fetched at the pinned head, reused when checking citations. */
  fileLines: Map<string, string[]>;
  /** Head line numbers that appear in each file's diff (added and context lines). */
  diffLinesByPath: Map<string, Set<number>>;
};

const clip = (text: string, max: number) =>
  text.length <= max ? { text, clipped: false } : { text: text.slice(0, max), clipped: true };

const numbered = (lines: string[], start: number, end: number) =>
  lines
    .slice(start - 1, end)
    .map((line, i) => `${String(start + i).padStart(6)}| ${line}`)
    .join("\n");

export function requirementIdOf(req: Requirement): string {
  return req.kind === "issue" ? `${req.issueRepo}#${req.issue.number}` : req.id;
}

/**
 * Builds the bounded context for the model: requirement, README excerpt, the pinned diff
 * with line numbers, and the code around each change at the pinned head commit.
 * Everything left out is recorded, so the review can say what it did not see.
 */
export async function gatherContext(
  token: string,
  repoFullName: string,
  target: PinnedTarget,
  cmp: Comparison,
  requirement: Requirement,
): Promise<ReviewContext> {
  const sources: ContextSource[] = [];
  const omissions: string[] = [];
  const fileLines = new Map<string, string[]>();
  const diffLinesByPath = new Map<string, Set<number>>();
  const sections: string[] = [];
  let used = 0;
  const add = (section: string) => {
    sections.push(section);
    used += section.length;
  };

  // --- Requirement ---
  const requirementId = requirementIdOf(requirement);
  const fullText =
    requirement.kind === "issue" ? `${requirement.issue.title}\n\n${requirement.issue.body}` : requirement.text;
  const req = clip(fullText, MAX_REQUIREMENT_CHARS);
  if (req.clipped) omissions.push(`The requirement text was cut to its first ${MAX_REQUIREMENT_CHARS} characters.`);
  add(`<requirement id="${requirementId}">\n${req.text}\n</requirement>`);
  sources.push({
    kind: requirement.kind === "issue" ? "issue" : "manual-requirement",
    path: requirement.kind === "issue" ? requirement.issue.htmlUrl : null,
    sha: null,
    lineStart: null,
    lineEnd: null,
    note: requirement.kind === "issue" ? "Fetched live; issues are not pinned to a commit." : "Entered by hand.",
  });

  // --- README (context, not proof) ---
  const readme = await getReadme(token, repoFullName, target.headSha);
  if (readme) {
    const excerpt = clip(readme, MAX_README_CHARS);
    add(`<readme note="project background only; not evidence about this change">\n${excerpt.text}\n</readme>`);
    sources.push({
      kind: "README",
      path: "README",
      sha: target.headSha,
      lineStart: 1,
      lineEnd: splitLines(excerpt.text).length,
      note: excerpt.clipped ? `First ${MAX_README_CHARS} characters only.` : null,
    });
  } else {
    omissions.push("The repository has no README at the pinned head commit.");
  }

  // --- Diff ---
  const order: Record<FileKind, number> = { source: 0, test: 1, config: 2, doc: 3 };
  const files = [...cmp.files].sort((a, b) => order[classifyFile(a.filename)] - order[classifyFile(b.filename)]);
  if (cmp.files.length >= 300) {
    omissions.push("GitHub lists at most 300 changed files, so files beyond that were not seen at all.");
  }

  const diffParts: string[] = [];
  for (const f of files) {
    const kind = classifyFile(f.filename);
    const header = `--- ${f.filename} (${kind}, ${f.status}, +${f.additions} -${f.deletions})`;
    if (!f.patch) {
      diffParts.push(`${header}\n(no text diff available: binary or too large)`);
      omissions.push(`${f.filename}: GitHub returned no text diff, so its content was not reviewed.`);
      continue;
    }
    const inDiff = new Set<number>();
    for (const r of hunkRanges(f.patch)) for (let n = r.start; n <= r.end; n++) inDiff.add(n);
    diffLinesByPath.set(f.filename, inDiff);
    if (used + diffParts.join("\n").length > MAX_TOTAL_CHARS * 0.6) {
      diffParts.push(`${header}\n(diff not included: context budget reached)`);
      omissions.push(`${f.filename}: its diff was left out because the context budget was reached.`);
      continue;
    }
    const patch = clip(numberedPatch(f.patch), MAX_PATCH_CHARS);
    if (patch.clipped) omissions.push(`${f.filename}: only the first part of its diff was shown to the model.`);
    diffParts.push(`${header}\n${patch.text}${patch.clipped ? "\n(diff cut here)" : ""}`);
    sources.push({ kind: "diff", path: f.filename, sha: target.headSha, lineStart: null, lineEnd: null, note: null });
  }
  add(
    `<diff base="${target.baseSha}" head="${target.headSha}" note="numbers on the left are line numbers in the file at head; '+' lines were added, '-' lines removed">\n${diffParts.join("\n\n")}\n</diff>`,
  );

  // --- Code around the changes, at the pinned head ---
  const codeParts: string[] = [];
  let fetched = 0;
  for (const f of files) {
    const kind = classifyFile(f.filename);
    if ((kind !== "source" && kind !== "test") || !f.patch || f.status === "removed") continue;
    if (fetched >= MAX_FILES_FETCHED || used + codeParts.join("\n").length > MAX_TOTAL_CHARS) {
      omissions.push(`${f.filename}: surrounding code was not fetched because the context budget was reached.`);
      continue;
    }
    fetched++;
    const content = await getFileAtRef(token, repoFullName, f.filename, target.headSha);
    if (content === null) {
      omissions.push(`${f.filename}: the file could not be read at the pinned head (too large or binary).`);
      continue;
    }
    const lines = splitLines(content);
    fileLines.set(f.filename, lines);
    const windows = padAndMerge(hunkRanges(f.patch), kind === "source" ? SOURCE_PAD : TEST_PAD, lines.length);
    let fileChars = 0;
    for (const w of windows) {
      const body = numbered(lines, w.start, w.end);
      if (fileChars + body.length > MAX_FILE_WINDOW_CHARS) {
        omissions.push(`${f.filename}: lines ${w.start}-${w.end} around a change were left out to stay within budget.`);
        continue;
      }
      fileChars += body.length;
      codeParts.push(
        `--- ${f.filename} (${kind}) lines ${w.start}-${w.end} of ${lines.length} at head\n${body}`,
      );
      sources.push({
        kind: kind === "test" ? "test" : "code",
        path: f.filename,
        sha: target.headSha,
        lineStart: w.start,
        lineEnd: w.end,
        note: null,
      });
    }
  }
  if (codeParts.length) {
    add(`<code-at-head sha="${target.headSha}">\n${codeParts.join("\n\n")}\n</code-at-head>`);
  }

  if (omissions.length) {
    add(`<not-shown>\n${omissions.map((o) => `- ${o}`).join("\n")}\n</not-shown>`);
  }

  return {
    requirementId,
    requirementText: fullText,
    prompt: sections.join("\n\n"),
    sources,
    omissions,
    fileLines,
    diffLinesByPath,
  };
}
