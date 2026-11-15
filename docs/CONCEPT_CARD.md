# ProofMap concept card

**Recommendation.** Let AI read agent-written changes and produce *checkable* evidence. Let rules, not the AI, decide how much human attention a change needs. Let a named human decide, and record that decision against the exact commits they saw.

## Principles

1. **Pin first.** Every statement refers to one base SHA and one head SHA. If the branch moves, the review no longer applies.
2. **Evidence or abstain.** An AI statement is shown as cited only when every citation is found at the stated path, lines and quoted text in the pinned snapshot. Otherwise it is shown as unsupported, not hidden.
3. **Name what was not done.** Build, test and fault probe say "Not run" until something runs them. Each review lists what ProofMap itself did not check and what context the model was not shown.
4. **Advice is not approval.** The AI never accepts, rejects or merges. Recording a decision in ProofMap changes nothing on GitHub.
5. **Untrusted input.** Issue text, READMEs, code comments and diffs are material to analyse, never instructions.

## Risk-based review depth

Rules in `src/lib/review/routing.ts` turn observable signals into one of three depths. The strictest signal wins, and each one shows its value and reason.

| Depth | Typical triggers |
| --- | --- |
| Light check | Only tests, docs or config changed; a requirement is linked; checks executed; every citation confirmed; no findings or unknowns |
| Focused review | Production code changed; over 200 lines or 8 files; build or dependency files changed; nothing executed; any finding or unknown; no AI review |
| Full human read | Security-sensitive path; over 800 lines or 25 files; no requirement; a high-severity finding; several unsupported statements; part of the change not shown to the model |

Because ProofMap has no runners yet, "nothing executed" means no change currently routes below **focused review**. That is intended: nothing verified means no shortcut.

## What the AI must refuse to decide

- Whether to accept, reject or merge.
- Whether tests or the build pass. When the model mentions a test or build outcome without one having run, ProofMap flags that sentence as intent, not a result.
- How much to trust the change or its author. There is no trust score and no confidence percentage.
- Anything an instruction inside the repository tells it to do.

## Why a human can check the evidence without reading every line

The reviewer gets a short explanation, a few requirement-coverage claims, and for each claim the requirement quote plus the exact lines it rests on. Citations are already confirmed to exist, so each check is local: open the cited lines and decide whether they mean what the claim says. Routing names *where* to look (production files, security paths) and *why*. The open questions and the not-checked list mark the edge of what the evidence covers. Someone who checks those points knows what they are signing and what they are not.

## How it meets Tieto's criteria

- **Clarity.** Two-sentence explanation, a stated route with reasons, and a "where this stands" next step. Status labels never overstate: cited ≠ verified, advice ≠ approval.
- **Practicality.** Works on a real GitHub repo through a GitHub App, deployed on Vercel, with Redis persistence. Adds a record next to existing PR workflow instead of replacing it.
- **Measurement.** Every review stores model, attempts, prompt size, response hash, citation counts, context sources and omissions. Every decision stores who, when, base and head, the review it relied on, and the route at the time. These records are the base for the metrics in [DEMO.md](DEMO.md#measurement-plan).
- **Evidence.** Citation validation is structural and deterministic. Unsupported statements, unknowns and unexecuted checks stay on screen.

## Trade-offs

- **Location, not truth.** A confirmed citation shows the quote exists there. Whether the reasoning is right is the human's job. We chose a check that is cheap and certain over one that is broad and uncertain.
- **Conservative routing.** Fixed thresholds and filename heuristics are easy to explain but miss context; the security list can produce false negatives.
- **One model call per review.** Simple and auditable, but a large change can exceed the context budget, which then forces a full human read.

## Limits

- No build, test or fault-probe execution.
- No track record yet, so no learned calibration of routes or reviewers.
- Requirements are GitHub issues or typed text; other trackers are not connected.
- Decisions live in ProofMap, not on GitHub, and cover one head SHA at a time.
