"use server";

import { redirect } from "next/navigation";
import { GitHubError, listInstallationRepos } from "@/lib/github";
import { clearSession, getSession, saveSession } from "@/lib/session";

/**
 * Persists the chosen repository in the session. The ids come from a form, so
 * they are re-checked against GitHub with the signed-in user's own token.
 */
export async function selectRepo(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/?error=signed_out");

  const installationId = Number(formData.get("installationId"));
  const repoId = Number(formData.get("repoId"));
  if (!Number.isSafeInteger(installationId) || !Number.isSafeInteger(repoId)) {
    redirect("/repos?error=invalid_selection");
  }

  let repo;
  try {
    const repos = await listInstallationRepos(session.accessToken, installationId);
    repo = repos.find((r) => r.id === repoId);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 401) {
      await clearSession();
      redirect("/?error=signed_out");
    }
    redirect("/repos?error=invalid_selection");
  }
  if (!repo) redirect("/repos?error=invalid_selection");

  await saveSession({
    ...session,
    selectedRepo: {
      id: repo.id,
      fullName: repo.fullName,
      htmlUrl: repo.htmlUrl,
      private: repo.private,
      defaultBranch: repo.defaultBranch,
      installationId,
      selectedAt: new Date().toISOString(),
    },
  });
  redirect("/repos");
}

export async function clearSelectedRepo() {
  const session = await getSession();
  if (session) await saveSession({ ...session, selectedRepo: null });
  redirect("/repos");
}

export async function signOut() {
  await clearSession();
  redirect("/");
}
