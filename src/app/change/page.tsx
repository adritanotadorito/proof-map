import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadChange } from "@/lib/change-data";
import { geminiConfigured, geminiModel } from "@/lib/gemini";
import { getSession } from "@/lib/session";
import { ChangeView } from "./change-view";

export const metadata = { title: "Pinned change · ProofMap" };

type SearchParams = Promise<{ tab?: string; requirementError?: string; decisionError?: string }>;

export default function ChangePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense
      fallback={
        <p className="mx-auto w-full max-w-[1280px] px-4 py-10 text-sm text-muted sm:px-6">
          Reading the pinned change from GitHub…
        </p>
      }
    >
      <Change searchParams={searchParams} />
    </Suspense>
  );
}

async function Change({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session) redirect("/?error=signed_out");
  const { selectedRepo: repo, target } = session;
  if (!repo) redirect("/repos");
  if (!target) redirect("/target");
  const params = await searchParams;

  const data = await loadChange(session.accessToken, repo, target);
  return (
    <ChangeView
      userLogin={session.user.login}
      userId={session.user.id}
      repo={repo}
      target={target}
      data={data}
      requirementError={params.requirementError}
      decisionError={params.decisionError}
      reviewer={{ configured: geminiConfigured(), model: geminiModel() }}
    />
  );
}
