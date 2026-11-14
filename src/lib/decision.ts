import "server-only";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Route } from "./review/types";

/**
 * A named human's decision about one pinned change. It is a record inside ProofMap only:
 * nothing is merged, approved or commented on GitHub. Stored as JSON under .data/decisions
 * (ignored by Git) until a database exists. A decision belongs to exactly one base and head SHA.
 */
export type DecisionKind = "accept" | "request-changes" | "defer";

export const DECISION_LABEL: Record<DecisionKind, string> = {
  accept: "Accepted for this reference demo",
  "request-changes": "Changes requested",
  defer: "Deferred",
};

export type Decision = {
  id: string;
  repoId: number;
  repoFullName: string;
  ref: string;
  prNumber: number | null;
  baseSha: string;
  headSha: string;
  decision: DecisionKind;
  /** What the person says they checked, what they did not, and the risk they accept. */
  evidenceChecked: string;
  unchecked: string;
  residualRisk: string;
  requirementId: string | null;
  /** The AI review the person had in front of them, if any. */
  reviewCreatedAt: string | null;
  reviewModel: string | null;
  routeAtDecision: Route;
  user: { id: number; login: string; name: string | null };
  at: string;
};

export const NOTE_MIN = 10;
export const NOTE_MAX = 1500;

const DIR = path.join(process.cwd(), ".data", "decisions");
const safe = (s: string) => s.replace(/[^0-9a-f]/gi, "").slice(0, 64);
const fileFor = (repoId: number, baseSha: string, headSha: string) =>
  path.join(DIR, `${Math.trunc(repoId)}-${safe(baseSha)}-${safe(headSha)}.json`);

async function readList(file: string): Promise<Decision[]> {
  try {
    const data = JSON.parse(await readFile(file, "utf8"));
    return Array.isArray(data) ? (data as Decision[]) : [];
  } catch {
    return [];
  }
}

/** Decisions recorded for exactly this pinned change, oldest first. The last one is current. */
export function loadDecisions(repoId: number, baseSha: string, headSha: string): Promise<Decision[]> {
  return readList(fileFor(repoId, baseSha, headSha));
}

/** Appends: earlier decisions are kept as history, never overwritten. */
export async function appendDecision(decision: Decision): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const file = fileFor(decision.repoId, decision.baseSha, decision.headSha);
  const list = await readList(file);
  list.push(decision);
  await writeFile(file, JSON.stringify(list, null, 2));
}

/** The latest decision on each OTHER head of the same branch or pull request. They do not cover this head. */
export async function loadDecisionsOnOtherHeads(repoId: number, ref: string, headSha: string): Promise<Decision[]> {
  let names: string[];
  try {
    names = await readdir(DIR);
  } catch {
    return [];
  }
  const out: Decision[] = [];
  for (const name of names.filter((n) => n.startsWith(`${Math.trunc(repoId)}-`) && n.endsWith(".json"))) {
    const list = await readList(path.join(DIR, name));
    const last = list[list.length - 1];
    if (last && last.ref === ref && last.headSha !== headSha) out.push(last);
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
