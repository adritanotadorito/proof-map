/** Pure helpers for GitHub's unified-diff "patch" text. No server-only imports: used by UI and tests. */

export type PatchRow =
  | { kind: "hunk"; text: string }
  | { kind: "add" | "del" | "ctx"; oldNo: number | null; newNo: number | null; text: string }
  | { kind: "note"; text: string };

export function parsePatch(patch: string): PatchRow[] {
  const rows: PatchRow[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      rows.push({ kind: "hunk", text: line });
    } else if (line.startsWith("+")) {
      rows.push({ kind: "add", oldNo: null, newNo: newNo++, text: line.slice(1) });
    } else if (line.startsWith("-")) {
      rows.push({ kind: "del", oldNo: oldNo++, newNo: null, text: line.slice(1) });
    } else if (line.startsWith("\\")) {
      rows.push({ kind: "note", text: line.slice(2) });
    } else {
      rows.push({ kind: "ctx", oldNo: oldNo++, newNo: newNo++, text: line.slice(1) });
    }
  }
  return rows;
}

/** Line numbers, in the new version of the file, that this patch adds. */
export function addedLines(patch: string): number[] {
  const out: number[] = [];
  for (const row of parsePatch(patch)) {
    if (row.kind === "add" && row.newNo !== null) out.push(row.newNo);
  }
  return out;
}

export type Range = { start: number; end: number };

/** Each hunk's span in the new version of the file. */
export function hunkRanges(patch: string): Range[] {
  const ranges: Range[] = [];
  let current: Range | null = null;
  for (const row of parsePatch(patch)) {
    if (row.kind === "hunk") {
      current = null;
    } else if ((row.kind === "add" || row.kind === "ctx") && row.newNo !== null) {
      if (!current) {
        current = { start: row.newNo, end: row.newNo };
        ranges.push(current);
      } else {
        current.end = row.newNo;
      }
    }
  }
  return ranges;
}

/** Widens each range by `pad` lines, clamps to the file, and merges overlaps. */
export function padAndMerge(ranges: Range[], pad: number, lineCount: number): Range[] {
  const padded = ranges
    .map((r) => ({ start: Math.max(1, r.start - pad), end: Math.min(lineCount, r.end + pad) }))
    .filter((r) => r.start <= r.end)
    .sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const r of padded) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/** The diff with new-file line numbers in front of each line, so a reader can cite lines from it. */
export function numberedPatch(patch: string): string {
  return parsePatch(patch)
    .map((row) => {
      if (row.kind === "hunk") return row.text;
      if (row.kind === "note") return `      | \\ ${row.text}`;
      const no = row.newNo === null ? "" : String(row.newNo);
      const sign = row.kind === "add" ? "+" : row.kind === "del" ? "-" : " ";
      return `${no.padStart(6)}| ${sign}${row.text}`;
    })
    .join("\n");
}

export function splitLines(content: string): string[] {
  const lines = content.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
