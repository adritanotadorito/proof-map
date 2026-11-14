"use server";

import { redirect } from "next/navigation";
import { currentHeadSha, pinBranch, pinPull, type PinResult } from "@/lib/change";
import { loadChange } from "@/lib/change-data";
import { NOTE_MAX, NOTE_MIN, appendDecision, type DecisionKind } from "@/lib/decision";
import { requirementIdOf } from "@/lib/review/context";
import { GitHubError, getIssue, listInstallationRepos } from "@/lib/github";
import {
  MAX_MANUAL_TEXT,
  clearManualRequirement,
  parseIssueReference,
  saveManualRequirement,
} from "@/lib/requirement";
import { GeminiError } from "@/lib/gemini";
import { runReview } from "@/lib/review/run";
import { saveFailure, saveReview } from "@/lib/review/store";
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
    // A pinned change belongs to one repository, so it is dropped when the repository changes.
    target: session.selectedRepo?.id === repo.id ? session.target : null,
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
  if (session) await saveSession({ ...session, selectedRepo: null, target: null });
  redirect("/repos");
}

export async function signOut() {
  await clearSession();
  redirect("/");
}

/** Pins the base and head SHA of a branch or pull request in the selected repository. */
export async function pinTarget(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/?error=signed_out");
  const repo = session.selectedRepo;
  if (!repo) redirect("/repos");

  const kind = formData.get("kind");
  let result: PinResult;
  try {
    if (kind === "pr") {
      const number = Number(formData.get("number"));
      if (!Number.isSafeInteger(number) || number <= 0) redirect("/target?error=invalid");
      result = await pinPull(session.accessToken, repo.fullName, number);
    } else {
      const branch = String(formData.get("branch") ?? "");
      if (!branch || branch.length > 255) redirect("/target?error=invalid");
      const mode = formData.get("mode") === "head-commit" ? "head-commit" : "auto";
      result = await pinBranch(session.accessToken, repo.fullName, branch, mode);
    }
  } catch (error) {
    if (error instanceof GitHubError) redirect("/target?error=github");
    throw error;
  }
  if (!result.ok) redirect("/target?error=not_found");

  await saveSession({ ...session, target: result.target });
  await clearManualRequirement();
  redirect("/change");
}

/** Records a requirement the signed-in person supplies when none was found, or to override one. */
export async function setManualRequirement(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/?error=signed_out");
  const { selectedRepo: repo, target } = session;
  if (!repo || !target) redirect("/target");

  const base = {
    repoId: repo.id,
    headSha: target.headSha,
    enteredBy: session.user.login,
    enteredAt: new Date().toISOString(),
  };
  const reference = String(formData.get("reference") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim().slice(0, 80);
  const text = String(formData.get("text") ?? "").trim();

  if (reference) {
    const parsed = parseIssueReference(reference);
    if (!parsed) redirect("/change?tab=requirement&requirementError=bad_reference");
    let issue;
    try {
      issue = await getIssue(session.accessToken, parsed.repo, parsed.number);
    } catch {
      redirect("/change?tab=requirement&requirementError=issue_not_found");
    }
    if (!issue || issue.isPullRequest) redirect("/change?tab=requirement&requirementError=issue_not_found");
    await saveManualRequirement({ ...base, kind: "issue", issueRepo: parsed.repo, issueNumber: parsed.number });
  } else if (id && text) {
    if (text.length > MAX_MANUAL_TEXT) redirect("/change?tab=requirement&requirementError=too_long");
    await saveManualRequirement({ ...base, kind: "text", id, text });
  } else {
    redirect("/change?tab=requirement&requirementError=empty");
  }
  redirect("/change?tab=requirement");
}

export async function resetManualRequirement() {
  await clearManualRequirement();
  redirect("/change?tab=requirement");
}

/** True when the form was rendered for the change that is pinned right now. */
function formMatchesPin(formData: FormData, target: { baseSha: string; headSha: string }): boolean {
  return formData.get("baseSha") === target.baseSha && formData.get("headSha") === target.headSha;
}

/** Runs the AI review of the pinned change. Advice only: it records evidence and decides nothing. */
export async function reviewChange(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/?error=signed_out");
  const { selectedRepo: repo, target } = session;
  if (!repo || !target) redirect("/target");

  let message: string | null = null;
  try {
    if (!formMatchesPin(formData, target)) {
      message = "This page was showing a different pinned change. Reload and try again.";
    } else if ((await currentHeadSha(session.accessToken, repo.fullName, target)) !== target.headSha) {
      // Never review a head the person has not pinned.
      message = "The branch head has moved since it was pinned, so no review was run. Pin the new head first.";
    } else {
      const { result, record } = await runReview(session);
      if (result.ok && record) await saveReview(record);
      else if (!result.ok) message = result.message;
    }
  } catch (error) {
    if (error instanceof GitHubError && error.status === 401) {
      await clearSession();
      redirect("/?error=signed_out");
    }
    if (error instanceof GeminiError) message = error.message;
    else if (error instanceof GitHubError) message = "GitHub returned an error while gathering context. Try again.";
    else if (error instanceof Error && error.name === "TimeoutError") message = "The model did not answer within two minutes, so the attempt was abandoned. Try again.";
    else {
      console.error("Review failed:", error);
      message = "The review failed unexpectedly. See the server log.";
    }
  }
  if (message) {
    await saveFailure(repo.id, target.baseSha, target.headSha, {
      at: new Date().toISOString(),
      requestedBy: session.user.login,
      message,
    });
  }
  redirect(message ? "/change?tab=review" : "/change");
}

/**
 * Records the signed-in person's decision about the pinned change. A record inside ProofMap only:
 * nothing is merged, approved or posted to GitHub.
 */
export async function recordDecision(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/?error=signed_out");
  const { selectedRepo: repo, target } = session;
  if (!repo || !target) redirect("/target");
  const back = (error: string) => redirect(`/change?tab=decision&decisionError=${error}`);

  if (!formMatchesPin(formData, target)) back("changed");
  const kind = String(formData.get("decision") ?? "");
  if (kind !== "accept" && kind !== "request-changes" && kind !== "defer") back("choose");
  const note = (name: string) => String(formData.get(name) ?? "").trim();
  const evidenceChecked = note("evidenceChecked");
  const unchecked = note("unchecked");
  const residualRisk = note("residualRisk");
  if ([evidenceChecked, unchecked, residualRisk].some((t) => t.length < NOTE_MIN || t.length > NOTE_MAX)) back("notes");

  let data;
  try {
    data = await loadChange(session.accessToken, repo, target);
  } catch {
    back("github");
  }
  if (!data || data.loadError) back("github");
  // A decision must describe the commit that is actually at the head of the branch.
  if (data!.stale) back("stale");
  const requirement = data!.resolution?.requirement ?? null;
  if (kind === "accept" && !requirement) back("accept_needs_requirement");
  if (kind === "accept" && !data!.review) back("accept_needs_review");

  const at = new Date().toISOString();
  await appendDecision({
    id: at,
    repoId: repo.id,
    repoFullName: repo.fullName,
    ref: target.ref,
    prNumber: target.prNumber,
    baseSha: target.baseSha,
    headSha: target.headSha,
    decision: kind as DecisionKind,
    evidenceChecked,
    unchecked,
    residualRisk,
    requirementId: requirement ? requirementIdOf(requirement) : null,
    reviewCreatedAt: data!.review?.createdAt ?? null,
    reviewModel: data!.review ? (data!.review.model.versionReported ?? data!.review.model.requested) : null,
    routeAtDecision: data!.routing.route,
    user: session.user,
    at,
  });
  redirect("/change?tab=decision");
}
