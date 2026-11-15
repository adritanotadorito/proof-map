# ProofMap

**Live demo: [proof-map.vercel.app](https://proof-map.vercel.app/)** · Junction 2026 · Tieto challenge "Earned Trust in AI Code"

AI agents now write pull requests, and AI can review them. The decision to ship still belongs to a person. ProofMap lets AI do the reading while a **named human** stays accountable, and it never shows a review, a test or an approval that did not happen.

## The recommendation

1. **Pin the change and its requirement.** A branch or pull request is pinned to an exact base and head SHA. The requirement (a GitHub issue) is matched from the branch name and Git history, or entered by hand.
2. **Retrieve context.** The requirement, README excerpt, numbered diff and surrounding code at the head SHA, within a stated budget. Anything left out is listed.
3. **Generate AI advice.** Gemini returns a two-sentence explanation, requirement-coverage claims, findings and unverified questions, each with citations. Repository text is treated as untrusted material, never as instructions.
4. **Validate citation locations.** Every citation is checked against the real file at the pinned head (path, line range, quoted text, and for diff citations, that the lines are in the diff). A statement with any failed citation is shown as unsupported.
5. **Route human attention by explainable risk.** Rule-based signals (production code changed, security-sensitive paths, size, missing requirement, executed checks, unsupported statements, findings, unknowns, omitted context) pick a review depth: light check, focused review or full human read. Every signal shows its reason. There is no trust score.
6. **Expose abstentions and unchecked work.** Build, test and fault probe show "Not run". The reviewer's open questions and ProofMap's own "not checked" list stay visible beside the claims.
7. **Record the human decision against the pinned SHAs.** Accept, request changes or defer, signed by the GitHub user, with what they checked, what they did not and the risk they accept. It is a ProofMap record only: nothing is approved or merged on GitHub.

More: [Concept card](docs/CONCEPT_CARD.md) · [Demo script](docs/DEMO.md) · [Lessons log](docs/LESSONS_LOG.md)

## Walkthrough (`ju26-issue-2283`)

1. Open the [live demo](https://proof-map.vercel.app/) and continue with GitHub. ProofMap only sees repositories where its GitHub App is installed.
2. Choose `junction26-messagepack-csharp`, then branch `ju26-issue-2283`. It pins base `32258fdbee` → head `9df83c3840` (4 files, +225 −3).
3. **Requirement:** matched to `MessagePack-CSharp/MessagePack-CSharp#2283`, with the evidence for the match.
4. **Overview:** the saved review (gemini-3.8-flash), two requirement-coverage claims, 0 findings, and the unverified items. The route is **focused review**, with the reasons listed.
5. **Files changed:** the diff, with cited AI statements placed inline at their lines. Click a citation to open the source at the pinned head with the lines highlighted.
6. **Decision:** the decision recorded for this head, and the form to record a new one.

## Implemented, proposed and unverified

| Status | What |
| --- | --- |
| Implemented and deployed | GitHub App sign-in; repo, branch and PR selection with pinned SHAs; requirement matching and manual override; Gemini review with structural output checks; citation location validation; rule-based routing; timeline; decision records; Redis persistence |
| Observed in production | One review of #2283: 6 of 6 citation locations confirmed, 0 findings, 1 model question plus 4 items ProofMap did not check. One Defer decision by `@adritanotadorito`, persisted across reloads |
| Not implemented | Build, test and fault-probe runners (always shown as "Not run"); posting to GitHub; merge; any track-record trust score |
| Unverified | Whether the AI claims are *correct*: a confirmed citation shows the quoted text exists at that place, not that the code works. ProofMap has not built or tested the C# fix |

## Local setup

Requires Node.js 20.9 or later.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` yourself (never commit it). Variable names:

- `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`: from your GitHub App
- `APP_URL`: where the app runs, without a trailing slash (`http://localhost:3000` locally)
- `SESSION_SECRET`: at least 32 characters, for example from `openssl rand -hex 32`
- `GEMINI_API_KEY`; optional `GEMINI_MODEL` (default `gemini-3.8-flash`)
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`: Upstash Redis (required in production)

**GitHub App callback URL:** `<APP_URL>/api/auth/github/callback`, for example `https://proof-map.vercel.app/api/auth/github/callback`. Register one per environment (local and production).

**Persistence:** with the two `KV_REST_API_*` variables set, reviews and decisions are stored in Upstash Redis. Without them, local development falls back to JSON files in `.data/` (ignored by Git). On Vercel the filesystem does not persist, so a missing store is an error there. Sessions live in an encrypted httpOnly cookie, and the GitHub token never reaches the browser.

**Deploy on Vercel:** import the repository, add Upstash Redis from the Vercel Marketplace (it sets the `KV_REST_API_*` variables), set the remaining variables, and register the production callback URL on the GitHub App.

## Checks

```bash
npx tsc --noEmit
```

```bash
npm run lint
```

```bash
npm run build
```

There is no automated test suite yet.
