import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { BranchIcon, GitHubMark, PersonIcon, RepoIcon } from "@/components/icons";
import { Heatmap, activitySummary, heatmapStart } from "@/components/heatmap";
import { loadActivity } from "@/lib/activity";
import { getGitHubConfig } from "@/lib/github";
import { getSession } from "@/lib/session";

type SearchParams = Promise<{ error?: string }>;

const errorMessages: Record<string, string> = {
  not_configured: "GitHub sign-in is not configured yet. Add the GitHub App values to .env.local and restart the dev server.",
  access_denied: "GitHub authorization was cancelled, so you were not signed in.",
  state_mismatch: "The sign-in attempt could not be verified. Please try again.",
  missing_code: "GitHub did not return an authorization code. Please try again.",
  sign_in_failed: "GitHub sign-in failed. Check the client ID and secret in .env.local, then try again.",
  signed_out: "Your session has ended. Sign in again to continue.",
};

const CitedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-[22px] w-[22px]">
    <path d="M13 8.5v4.75H2.75V3h6.5" />
    <path d="M5.5 8l2.25 2.25L13.5 3.5" />
  </svg>
);

const principles = [
  { icon: <BranchIcon className="h-[22px] w-[22px]" />, label: "Pin the exact commit" },
  { icon: <CitedIcon />, label: "Every claim cites source lines" },
  { icon: <PersonIcon className="h-[22px] w-[22px]" />, label: "A named human decides" },
];

async function HeroActions({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const message = error ? errorMessages[error] : undefined;
  const configured = getGitHubConfig() !== null;
  const session = configured ? await getSession() : null;
  await connection();
  const today = new Date().toISOString().slice(0, 10);
  const activity = session ? await loadActivity(session.user.login, heatmapStart(today)) : null;

  return (
    <>
      {message && (
        <p role="alert" className="flash flash-danger mt-6 max-w-[825px]">
          {message}
        </p>
      )}
      <div className="mt-7 flex flex-wrap items-center gap-4">
        {session ? (
          <>
            {session.target ? (
              <Link href="/change" className="btn btn-primary btn-lg">
                <BranchIcon className="h-5 w-5" />
                Open the pinned change
              </Link>
            ) : (
              <Link href="/repos" className="btn btn-primary btn-lg">
                <RepoIcon className="h-5 w-5" />
                Choose a repository
              </Link>
            )}
            <span className="text-sm text-muted">
              Signed in as @{session.user.login}
              {session.selectedRepo ? ` · ${session.selectedRepo.fullName}` : ""}
            </span>
          </>
        ) : (
          <>
            <a href="/api/auth/github/login" className="btn btn-primary btn-lg">
              <GitHubMark size={24} />
              Continue with GitHub
            </a>
            {!configured && <span className="text-sm text-muted">GitHub App not configured yet.</span>}
          </>
        )}
      </div>

      <section className="box mt-7 max-w-[825px] p-5" aria-label="Review activity" data-testid="activity">
        <h2 className="text-lg">
          {activity ? `${activitySummary(activity.reviews, activity.decisions)}${activity.reviews + activity.decisions > 0 ? ` by @${session!.user.login}` : ""}` : "Review activity"}
        </h2>
        {!activity && (
          <p className="mt-1 text-sm text-muted">
            Nothing is shown until you sign in. Each square is one day; it fills only when a review or decision is recorded.
          </p>
        )}
        <div className="mt-4">
          <Heatmap days={activity?.days ?? {}} today={today} />
        </div>
      </section>
    </>
  );
}

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main data-landing className="mx-auto w-full max-w-[1152px] px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
      <h1 className="text-[26px] font-semibold leading-tight sm:text-[30px]">Review agent pull requests with evidence</h1>
      <p className="mt-2.5 text-[17px] text-muted sm:text-[19px]">
        Agents propose changes. You see the evidence. Ship with confidence.
      </p>

      <Suspense fallback={<div className="mt-7 h-[52px]" />}>
        <HeroActions searchParams={searchParams} />
      </Suspense>

      <div className="box mt-[18px] max-w-[825px]">
        {principles.map(({ icon, label }) => (
          <div key={label} className="principle-row">
            <span className="shrink-0">{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <footer className="mt-12 text-xs text-muted">Built for Junction 2026 · Tieto challenge</footer>
    </main>
  );
}
