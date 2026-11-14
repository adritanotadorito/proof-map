/** The persisted review record. Types only: safe to import anywhere. */

export type Route = "light-check" | "focused-review" | "full-read";
export const ROUTE_ORDER: Route[] = ["light-check", "focused-review", "full-read"];
export const ROUTE_LABEL: Record<Route, string> = {
  "light-check": "Light check",
  "focused-review": "Focused review",
  "full-read": "Full human read",
};

/** Where a piece of evidence comes from. "check" is reserved for something ProofMap actually executed. */
export type SourceType = "requirement" | "source" | "diff";

export type CheckedCitation = {
  sourceType: SourceType;
  /** Null for requirement citations. */
  path: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  quote: string;
  /** True only when the quote was found at the stated place in the pinned snapshot or requirement text. */
  valid: boolean;
  problem: string | null;
};

export type Support = "cited" | "unsupported";

export type ReviewClaim = {
  id: string;
  statement: string;
  coverage: "addresses" | "partially-addresses" | "does-not-address" | "unclear";
  reason: string;
  citations: CheckedCitation[];
  /** "cited": every citation checked out. "unsupported": at least one did not, or none exist. */
  support: Support;
  /** "verified"/"contradicted" are reserved for an executed check. Citations never set them. */
  verification: "verified" | "contradicted" | "unverified";
};

export type ReviewFinding = {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  reason: string;
  impact: string;
  humanAction: string;
  citations: CheckedCitation[];
  support: Support;
};

export type ReviewUnknown = { question: string; whyUnresolved: string; nextCheck: string };

export type ReviewCheck = {
  id: string;
  type: "citation" | "format" | "build" | "test" | "fault-probe";
  method: string;
  result: "pass" | "fail" | "not-run";
  detail: string;
};

export type ContextSource = {
  kind: "issue" | "manual-requirement" | "README" | "diff" | "code" | "test";
  path: string | null;
  sha: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  note: string | null;
};

export type ReviewEvent = { at: string; actor: "human" | "tool" | "model" | "GitHub"; kind: string; detail: string };

export const REVIEW_VERSION = 2;

export type ReviewRecord = {
  version: typeof REVIEW_VERSION;
  repoId: number;
  repoFullName: string;
  installationId: number;
  baseSha: string;
  headSha: string;
  requestedBy: string;
  createdAt: string;
  requirement: { id: string; title: string | null; sourceUrl: string | null; textSha256: string };
  model: { requested: string; versionReported: string | null; attempts: number; promptChars: number; usage: Record<string, number> | null; responseSha256: string };
  contextSources: ContextSource[];
  /** Changed files or parts the model was NOT shown, and why. */
  contextOmissions: string[];
  /** Exactly two sentences saying what the change does. */
  explanation: [string, string];
  /** One sentence: the suggested next human action. */
  nextAction: string;
  claims: ReviewClaim[];
  findings: ReviewFinding[];
  unknowns: ReviewUnknown[];
  checks: ReviewCheck[];
  /** Things ProofMap itself did not check in this review, stated without the model. */
  notChecked: string[];
  /** Model sentences that mention a test or build outcome even though none was run. */
  outcomeMentions: string[];
  events: ReviewEvent[];
};

export type ReviewFailure = { at: string; requestedBy: string; message: string };
