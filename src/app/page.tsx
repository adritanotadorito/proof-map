import { Suspense } from "react";
import Link from "next/link";
import { getGitHubConfig } from "@/lib/github";
import { getSession } from "@/lib/session";

type SearchParams = Promise<{ error?: string }>;

const errorMessages: Record<string, string> = {
  not_configured:
    "GitHub sign-in is not configured yet. Add the GitHub App values to .env.local and restart the dev server.",
  access_denied: "GitHub authorization was cancelled, so you were not signed in.",
  state_mismatch: "The sign-in attempt could not be verified. Please try again.",
  missing_code: "GitHub did not return an authorization code. Please try again.",
  sign_in_failed: "GitHub sign-in failed. Check the client ID and secret in .env.local, then try again.",
  signed_out: "Your session has ended. Sign in again to continue.",
};

const primaryButton =
  "btn btn-primary btn-lg";

async function SignIn({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const message = error ? errorMessages[error] : undefined;
  const configured = getGitHubConfig() !== null;
  const session = configured ? await getSession() : null;

  return (
    <div className="mt-10">
      {message && (
        <p role="alert" className="mb-5 max-w-2xl flash flash-danger">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {session ? (
          <>
            <Link href="/repos" className={primaryButton}>
              Choose a repository
            </Link>
            <span className="text-sm text-muted">
              Signed in as @{session.user.login}
              {session.selectedRepo ? ` · ${session.selectedRepo.fullName} selected` : ""}
            </span>
          </>
        ) : (
          <>
            {/* A plain link: this must be a full navigation to the server route, not a client transition. */}
            <a href="/api/auth/github/login" className={primaryButton}>
              Continue with GitHub
            </a>
            {!configured && (
              <span className="text-sm text-muted">GitHub App not configured yet.</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const steps = [
  {
    title: "Read the change",
    body: "Pin the exact commit an agent wrote and link it to the requirement it claims to satisfy.",
  },
  {
    title: "Check the story",
    body: "Every claim cites source lines or a recorded check. Anything unsupported stays marked unverified.",
  },
  {
    title: "A named human decides",
    body: "The reviewer advises and abstains where evidence is missing. It never merges on its own.",
  },
];

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-1 flex-col">

      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
        <p className="eyebrow text-brand">
          Earned trust in AI code
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          AI reviews. Humans stay accountable.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
          ProofMap turns an agent-written change into evidence a person can
          check and own: what changed, what was verified, and what the reviewer
          refused to decide.
        </p>

        <Suspense fallback={<div className="mt-10 h-12" />}>
          <SignIn searchParams={searchParams} />
        </Suspense>

        <ol className="mt-14 grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="box p-5"
            >
              <span className="font-mono text-xs text-brand">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="mt-3 text-base font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </main>

      <footer className="mx-auto w-full max-w-[1280px] px-4 py-6 text-xs text-muted sm:px-6">
        Built for Junction 2026 · Tieto challenge
      </footer>
    </div>
  );
}
