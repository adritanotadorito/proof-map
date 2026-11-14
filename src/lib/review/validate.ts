/**
 * Checks a model's review before anyone sees it. Pure: no network, no server-only imports.
 * The model proposes; this file decides what may be shown and how it is labelled.
 */
import { z } from "zod";
import type { CheckedCitation, ReviewClaim, ReviewFinding, ReviewUnknown } from "./types";

export const MAX_CITATION_LINES = 150;
const MIN_QUOTE_CHARS = 6;
const MIN_REQUIREMENT_QUOTE_CHARS = 12;

const citation = z.object({
  sourceType: z
    .enum(["requirement", "source", "diff"])
    .describe('"requirement": a quote from the requirement text. "source": lines of a file at the head commit. "diff": lines of a file at the head commit that appear in the diff.'),
  path: z.string().max(400).describe('Repository-relative file path exactly as shown. Empty string for "requirement".'),
  lineStart: z.number().int().min(0).describe('First cited line number at the head commit. 0 for "requirement".'),
  lineEnd: z.number().int().min(0).describe('Last cited line number, inclusive. 0 for "requirement".'),
  quote: z.string().min(1).max(400).describe("A short exact copy of text found at the cited place: one line or part of one line."),
});

const modelOutput = z.object({
  explanation: z.object({
    first: z.string().min(1).max(500).describe("Exactly ONE sentence: what the change does."),
    second: z.string().min(1).max(500).describe("Exactly ONE more sentence completing the explanation of what the change does."),
  }),
  nextHumanAction: z.string().min(1).max(500).describe("Exactly ONE sentence: the most useful next thing for the human reviewer to do."),
  requirementCoverage: z
    .array(
      z.object({
        id: z.string().min(1).max(40).describe('Unique, like "claim-1".'),
        statement: z.string().min(1).max(600).describe("One concrete, checkable statement about how the change relates to a specific part of the requirement."),
        coverage: z.enum(["addresses", "partially-addresses", "does-not-address", "unclear"]),
        citations: z.array(citation).min(1).max(6).describe("At least one requirement quote and one source or diff location where possible."),
        reason: z.string().min(1).max(800).describe("Why the cited material supports the statement."),
      }),
    )
    .max(12),
  findings: z
    .array(
      z.object({
        id: z.string().min(1).max(40).describe('Unique, like "finding-1".'),
        title: z.string().min(1).max(200),
        severity: z.enum(["high", "medium", "low"]),
        reason: z.string().min(1).max(800).describe("What specifically may be wrong."),
        impact: z.string().min(1).max(500).describe("What would go wrong for users or maintainers if this is real."),
        citations: z.array(citation).min(1).max(4),
        humanAction: z.string().min(1).max(400).describe("What a human should look at or decide."),
      }),
    )
    .max(10),
  unverifiedQuestions: z
    .array(
      z.object({
        question: z.string().min(1).max(400),
        whyUnresolved: z.string().min(1).max(600).describe("Why the supplied material cannot establish this."),
        nextCheck: z.string().min(1).max(600).describe("The concrete check that would settle it."),
      }),
    )
    .max(10),
});

export type ModelOutput = z.infer<typeof modelOutput>;

/**
 * JSON Schema handed to the model API. Array and string length bounds are removed:
 * Gemini rejects minItems/maxItems with HTTP 400. zod enforces the full shape on the way back.
 */
export function modelJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(modelOutput) as Record<string, unknown>;
  const drop = new Set(["$schema", "minItems", "maxItems", "minLength", "maxLength", "additionalProperties"]);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>)
          .filter(([k]) => !drop.has(k))
          .map(([k, v]) => [k, walk(v)]),
      );
    }
    return node;
  };
  return walk(schema) as Record<string, unknown>;
}

const ABBREVIATIONS = /(?:\b(?:e\.g|i\.e|vs|etc|cf|approx|no|fig)\.)$/i;

/** Null when `text` is exactly one sentence; otherwise the reason it is not. */
export function oneSentenceProblem(text: string): string | null {
  const s = text.trim();
  if (s.length < 15) return "it is too short to be a sentence";
  if (/\n/.test(s)) return "it contains a line break";
  if (!/[.!?]["')\]`]*$/.test(s)) return "it does not end with sentence punctuation";
  const body = s.replace(/[.!?]["')\]`]*$/, "");
  const boundary = /[.!?]["')\]]*\s+(?=[A-Z"'(\[])/g;
  let m: RegExpExecArray | null;
  while ((m = boundary.exec(body)) !== null) {
    if (!ABBREVIATIONS.test(body.slice(0, m.index + 1))) return "it contains more than one sentence";
  }
  return null;
}

export type ShapeResult = { ok: true; output: ModelOutput } | { ok: false; problems: string[] };

/** Stage 1: is the response the required structure, with an explanation of exactly two sentences? */
export function checkShape(rawText: string): ShapeResult {
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { ok: false, problems: ["The response was not valid JSON."] };
  }
  const parsed = modelOutput.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const problems: string[] = [];
  const fields: [string, string][] = [
    ["explanation.first", parsed.data.explanation.first],
    ["explanation.second", parsed.data.explanation.second],
    ["nextHumanAction", parsed.data.nextHumanAction],
  ];
  for (const [name, text] of fields) {
    const p = oneSentenceProblem(text);
    if (p) problems.push(`${name} must be exactly one sentence, but ${p}.`);
  }
  const ids = [...parsed.data.requirementCoverage.map((c) => c.id), ...parsed.data.findings.map((f) => f.id)];
  if (new Set(ids).size !== ids.length) problems.push("Claim and finding ids must be unique.");
  return problems.length ? { ok: false, problems } : { ok: true, output: parsed.data };
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export type FileLookup = (path: string) => Promise<string[] | null>;

export type Snapshot = {
  requirementText: string;
  getLines: FileLookup;
  /** Head line numbers present in each changed file's diff. */
  diffLinesByPath: Map<string, Set<number>>;
};

type RawCitation = z.infer<typeof citation>;

/** Checks one citation against the requirement text or the real file at the pinned head commit. */
export async function checkCitation(c: RawCitation, snap: Snapshot): Promise<CheckedCitation> {
  const quote = squash(c.quote);
  if (c.sourceType === "requirement") {
    const base = { sourceType: c.sourceType, path: null, lineStart: null, lineEnd: null, quote: c.quote };
    if (quote.length < MIN_REQUIREMENT_QUOTE_CHARS) {
      return { ...base, valid: false, problem: "The quoted requirement text is too short to identify a passage." };
    }
    return squash(snap.requirementText).includes(quote)
      ? { ...base, valid: true, problem: null }
      : { ...base, valid: false, problem: "The quoted text does not appear in the requirement." };
  }

  const path = c.path.replace(/^\.\//, "");
  const base = { sourceType: c.sourceType, path, lineStart: c.lineStart, lineEnd: c.lineEnd, quote: c.quote };
  const reject = (problem: string): CheckedCitation => ({ ...base, valid: false, problem });
  if (!path) return reject("No file path was given.");
  if (c.lineStart < 1 || c.lineEnd < c.lineStart) return reject("The line range is not valid.");
  if (c.lineEnd - c.lineStart + 1 > MAX_CITATION_LINES) {
    return reject(`The range covers more than ${MAX_CITATION_LINES} lines, which is too broad to check.`);
  }
  const lines = await snap.getLines(path);
  if (!lines) return reject("No such text file exists at the pinned head commit.");
  if (c.lineEnd > lines.length) {
    return reject(`The file has ${lines.length} lines at the pinned head commit; the range goes past the end.`);
  }
  if (quote.length < MIN_QUOTE_CHARS) return reject("The quoted text is too short to identify the code.");
  if (!squash(lines.slice(c.lineStart - 1, c.lineEnd).join("\n")).includes(quote)) {
    return reject("The quoted text does not appear in the cited lines.");
  }
  if (c.sourceType === "diff") {
    const inDiff = snap.diffLinesByPath.get(path);
    let touches = false;
    for (let n = c.lineStart; inDiff && n <= c.lineEnd; n++) {
      if (inDiff.has(n)) {
        touches = true;
        break;
      }
    }
    if (!touches) return reject("These lines exist, but they are not part of the pinned diff.");
  }
  return { ...base, valid: true, problem: null };
}

export type Checked = {
  claims: ReviewClaim[];
  findings: ReviewFinding[];
  unknowns: ReviewUnknown[];
  citationsTotal: number;
  citationsRejected: number;
  outcomeMentions: string[];
};

/** Stage 2: check every citation, and mark anything with a failed citation as unsupported. */
export async function checkEvidence(output: ModelOutput, snap: Snapshot): Promise<Checked> {
  let total = 0;
  let rejected = 0;
  const checkAll = async (list: RawCitation[]) => {
    const out: CheckedCitation[] = [];
    for (const c of list) {
      const result = await checkCitation(c, snap);
      total++;
      if (!result.valid) rejected++;
      out.push(result);
    }
    return out;
  };
  const supportOf = (citations: CheckedCitation[]) =>
    citations.length > 0 && citations.every((c) => c.valid) ? ("cited" as const) : ("unsupported" as const);

  const claims: ReviewClaim[] = [];
  for (const claim of output.requirementCoverage) {
    const citations = await checkAll(claim.citations);
    claims.push({
      id: claim.id,
      statement: claim.statement,
      coverage: claim.coverage,
      reason: claim.reason,
      citations,
      support: supportOf(citations),
      verification: "unverified",
    });
  }
  const findings: ReviewFinding[] = [];
  for (const f of output.findings) {
    const citations = await checkAll(f.citations);
    findings.push({
      id: f.id,
      title: f.title,
      severity: f.severity,
      reason: f.reason,
      impact: f.impact,
      humanAction: f.humanAction,
      citations,
      support: supportOf(citations),
    });
  }

  // The model is told not to report test or build outcomes. Surface any sentence that mentions one anyway.
  const outcome = /\b(tests?|test suite|unit tests?|build|compil\w+|CI)\b[^.!?]{0,80}\b(pass(?:es|ed|ing)?|succeed(?:s|ed)?|green|fail(?:s|ed|ing)?)\b/i;
  const texts = [
    output.explanation.first,
    output.explanation.second,
    output.nextHumanAction,
    ...output.requirementCoverage.flatMap((c) => [c.statement, c.reason]),
    ...output.findings.flatMap((f) => [f.title, f.reason, f.impact]),
  ];
  const outcomeMentions = [
    ...new Set(texts.flatMap((t) => t.split(/(?<=[.!?])\s+/)).filter((sentence) => outcome.test(sentence))),
  ];

  return { claims, findings, unknowns: output.unverifiedQuestions, citationsTotal: total, citationsRejected: rejected, outcomeMentions };
}
