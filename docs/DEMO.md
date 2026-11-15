# Demo script (10 minutes)

Live at [proof-map.vercel.app](https://proof-map.vercel.app/). Before you start, sign in with GitHub and pin `junction26-messagepack-csharp` → `ju26-issue-2283`. The saved review (gemini-3.8-flash, 2026-11-15 04:24 UTC) and a Defer decision are already recorded for head `9df83c3840`. **Do not re-run the review during the demo.**

| Time | Screen | Show | Say |
| --- | --- | --- | --- |
| 0:00–1:00 | Landing | The headline and the three principles | "Agents write code and AI can review it. A person still owns the decision. ProofMap makes the evidence checkable and records who decided." |
| 1:00–2:00 | Change header | Branch `ju26-issue-2283`, base `32258fdbee` → head `9df83c3840`, 4 files | "Everything refers to these two SHAs. If the branch moves, this review no longer applies." |
| 2:00–3:00 | Requirement tab | `MessagePack-CSharp#2283` and why it matched | "The requirement is pinned too: matched from the branch name and Git history, overridable by hand." |
| 3:00–4:30 | Overview | Two-sentence explanation; checks: format pass, citation pass 6/6, build/test/fault probe **Not run** | "6 of 6 citation locations were found. That shows the quoted text exists there. It does not show the fix works. Nothing was built or tested." |
| 4:30–5:30 | Overview → claim → click `TypeCollector.cs:984-985` | Source at the pinned head with the cited lines highlighted | "A reviewer checks one claim in seconds: open the lines and decide if they mean what the claim says." |
| 5:30–6:30 | Overview → Unverified | The model's question ("Do the newly added unit tests pass…") and ProofMap's not-checked list | "The AI says what it could not establish. The flagged 'run the tests to confirm' sentence is intent, not a result." |
| 6:30–7:30 | Overview → routing | **Focused review**: production code changed (`TypeCollector.cs`), 228 changed lines, no executed checks | "Rules, not the model, set the review depth, and each reason is shown. There is no trust score." |
| 7:30–9:00 | Decision tab | The recorded Defer: evidence checked, not checked, residual risk, SHAs, review it relied on; then the empty form | "A named person signs against this head. Accept is blocked without a requirement and a review. This record does not approve or merge anything on GitHub." |
| 9:00–10:00 | Files changed | Diff with inline cited statements; file tree | "Only statements with confirmed citations are placed in the diff. Next steps: test runners, so *verified* can mean executed." |

## Likely judge questions

**What would make you distrust your own output?** A cited claim whose lines exist but do not support it: validation checks location, not meaning. Also routing thresholds that are hand-set and not yet calibrated, and a model omitting a real defect (0 findings is not evidence of none). The response is to keep "Not run" honest, keep unknowns visible, and measure disagreement between reviewer and AI over time.

**Who owns the decision?** The signed-in GitHub user who records it, by login and GitHub ID, for one head SHA, with their own notes on what they checked and did not. The AI cannot record, accept or merge.

**How does this scale?** Per change, cost is one model call and a bounded context budget. Validation and routing are deterministic and cheap. Routing concentrates people on production, security and large changes. What does not scale yet: no runners, and decisions are per head, so a new push needs a new decision.

## Measurement plan

| Metric | How it is measured | Status |
| --- | --- | --- |
| Citation location validity | Confirmed ÷ total citations per review | **Observed:** 6/6 on #2283 (one production review) |
| Abstentions | Unverified questions and not-checked items per review | **Observed:** 1 model question + 4 not-checked items on #2283 |
| Route distribution | Share of changes routed to light / focused / full human read | **Observed:** 1 change, focused review. A share needs many changes |
| Decision record | Decisions per head, with evidence notes | **Observed:** 1 Defer by `@adritanotadorito` on head `9df83c3840` |
| Human review time | Time from page open to decision; compare with and without ProofMap | Needs deployment history and a baseline. Not measured |
| Accepted findings | Findings the human confirms vs dismisses | Needs findings and a confirm/dismiss control. Not measured |
| Share routed to full human read | Full-read routes ÷ all routes | Needs deployment history |
| Reverts | Accepted heads later reverted | Needs merge and revert history. Not measured |
| Incidents | Production issues traced to an accepted change | Needs long-term history. Not measured |

No review-time improvement, revert rate or trust score is claimed.
