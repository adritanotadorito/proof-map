/**
 * Routes human attention from observable signals only. Pure and explainable:
 * every signal states its value, the route it asks for, and why. There is no
 * trust score: ProofMap has no track record yet to base one on.
 */
import { classifyFile, isBuildOrDependency, isSecuritySensitive } from "./classify";
import { ROUTE_ORDER, type ReviewRecord, type Route } from "./types";

export type Signal = {
  key: string;
  label: string;
  value: string;
  /** The least review depth this signal asks for. */
  asks: Route;
  why: string;
};

export type Routing = { route: Route; signals: Signal[]; drivers: Signal[] };

const some = (paths: string[]) => (paths.length <= 2 ? paths.join(", ") : `${paths.slice(0, 2).join(", ")} and ${paths.length - 2} more`);

export function routeChange(input: {
  files: { filename: string; additions: number; deletions: number }[];
  hasRequirement: boolean;
  review: ReviewRecord | null;
  reviewFailed: boolean;
  checksExecuted: number;
}): Routing {
  const { files, review } = input;
  const signals: Signal[] = [];
  const production = files.filter((f) => classifyFile(f.filename) === "source").map((f) => f.filename);
  const tests = files.filter((f) => classifyFile(f.filename) === "test");
  const sensitive = files.filter((f) => classifyFile(f.filename) !== "doc" && isSecuritySensitive(f.filename)).map((f) => f.filename);
  const build = files.filter((f) => isBuildOrDependency(f.filename)).map((f) => f.filename);
  const lines = files.reduce((n, f) => n + f.additions + f.deletions, 0);

  signals.push({
    key: "production",
    label: "Production code changed",
    value: production.length ? `${production.length} file${production.length === 1 ? "" : "s"}: ${some(production)}` : "none",
    asks: production.length ? "focused-review" : "light-check",
    why: production.length
      ? "Behaviour that ships is changed, so a person should read those files."
      : "Only tests, documentation or configuration changed.",
  });
  signals.push({
    key: "sensitive",
    label: "Security-sensitive paths",
    value: sensitive.length ? some(sensitive) : "none matched",
    asks: sensitive.length ? "full-read" : "light-check",
    why: sensitive.length
      ? "A changed path matches a security-related name, which calls for a full read."
      : "No changed path matches the security-related name list. That list is a heuristic.",
  });
  signals.push({
    key: "build",
    label: "Build or dependency files",
    value: build.length ? some(build) : "none",
    asks: build.length ? "focused-review" : "light-check",
    why: build.length ? "What gets built or pulled in changes." : "No build or dependency file changed.",
  });
  signals.push({
    key: "size",
    label: "Size of change",
    value: `${files.length} file${files.length === 1 ? "" : "s"}, ${lines} changed line${lines === 1 ? "" : "s"}${tests.length ? ` (${tests.reduce((n, f) => n + f.additions + f.deletions, 0)} in tests)` : ""}`,
    asks: lines > 800 || files.length > 25 ? "full-read" : lines > 200 || files.length > 8 ? "focused-review" : "light-check",
    why:
      lines > 800 || files.length > 25
        ? "Over 800 changed lines or 25 files: too broad to trust a summary."
        : lines > 200 || files.length > 8
          ? "Over 200 changed lines or 8 files: more than a glance can cover."
          : "200 changed lines or fewer, in 8 files or fewer.",
  });
  signals.push({
    key: "requirement",
    label: "Requirement",
    value: input.hasRequirement ? "linked" : "missing",
    asks: input.hasRequirement ? "light-check" : "full-read",
    why: input.hasRequirement
      ? "There is a stated requirement to check the change against."
      : "With no requirement there is nothing to check the change against.",
  });
  signals.push({
    key: "checks",
    label: "Executed checks",
    value: input.checksExecuted === 0 ? "none run (build, tests and fault probe unavailable)" : `${input.checksExecuted} run`,
    asks: input.checksExecuted === 0 ? "focused-review" : "light-check",
    why:
      input.checksExecuted === 0
        ? "Nothing was executed, so no claim is verified and a light check is not justified."
        : "At least one check was executed.",
  });

  if (!review) {
    signals.push({
      key: "review",
      label: "AI review",
      value: input.reviewFailed ? "last attempt failed" : "not run",
      asks: "focused-review",
      why: "There is no AI evidence to lean on, so a person has to read the change.",
    });
  } else {
    const unsupported = review.claims.filter((c) => c.support === "unsupported").length + review.findings.filter((f) => f.support === "unsupported").length;
    const items = review.claims.length + review.findings.length;
    const high = review.findings.filter((f) => f.severity === "high").length;
    signals.push({
      key: "unsupported",
      label: "Unsupported AI statements",
      value: `${unsupported} of ${items}`,
      asks: unsupported === 0 ? "light-check" : unsupported >= 3 || unsupported * 3 > items ? "full-read" : "focused-review",
      why:
        unsupported === 0
          ? "Every citation the reviewer gave was found in the pinned snapshot."
          : "A citation did not check out, so the reviewer's reading of the code is not fully reliable.",
    });
    signals.push({
      key: "findings",
      label: "Findings raised",
      value: `${review.findings.length}${high ? ` (${high} high)` : ""}`,
      asks: high ? "full-read" : review.findings.length ? "focused-review" : "light-check",
      why: high
        ? "The reviewer raised a high-severity risk."
        : review.findings.length
          ? "Each finding needs a person to confirm or dismiss it."
          : "The reviewer raised no findings. That is not evidence there are none.",
    });
    signals.push({
      key: "unknowns",
      label: "Unverified questions",
      value: String(review.unknowns.length),
      asks: review.unknowns.length ? "focused-review" : "light-check",
      why: review.unknowns.length ? "The reviewer named things it could not establish." : "The reviewer named no open questions.",
    });
    const omitted = review.contextOmissions.filter((o) => !o.startsWith("The repository has no README")).length;
    signals.push({
      key: "omissions",
      label: "Change not shown to the reviewer",
      value: omitted ? `${omitted} part${omitted === 1 ? "" : "s"} omitted` : "nothing omitted",
      asks: omitted ? "full-read" : "light-check",
      why: omitted ? "The input was too large, so the AI review is incomplete." : "The reviewer saw the whole diff.",
    });
  }

  const level = Math.max(...signals.map((s) => ROUTE_ORDER.indexOf(s.asks)));
  const route = ROUTE_ORDER[level];
  return { route, signals, drivers: signals.filter((s) => ROUTE_ORDER.indexOf(s.asks) === level && level > 0) };
}
