"use client";

import { DecisionIcon } from "@/components/icons";

const OPTIONS = [
  { value: "accept", label: "Accept for this demo", note: "Not a GitHub approval or merge" },
  { value: "request-changes", label: "Request changes", note: "Needs work" },
  { value: "defer", label: "Defer", note: "I'll come back to this" },
] as const;

/**
 * The start of the human decision, at the foot of the overview. It records nothing itself:
 * it carries the choice to the Decision tab, where the three required notes are written.
 */
export function DecisionBar({
  userLogin,
  acceptBlocked,
  blockedReason,
  current,
}: {
  userLogin: string;
  /** Why "accept" cannot be chosen yet, if it cannot. */
  acceptBlocked: string | null;
  /** Why no decision can be recorded at all, if none can. */
  blockedReason: string | null;
  current: string | null;
}) {
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const choice = new FormData(event.currentTarget).get("choice");
    const form = document.getElementById("decision-form");
    const radio = form?.querySelector<HTMLInputElement>(`input[name="decision"][value="${String(choice)}"]`);
    if (radio && !radio.disabled) radio.checked = true;
    window.history.pushState(null, "", "/change?tab=decision");
    // Wait for the Decision panel to be shown before scrolling to the form inside it.
    setTimeout(() => {
      form?.scrollIntoView({ block: "start" });
      form?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    }, 50);
  }

  return (
    <form onSubmit={onSubmit} className="box mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-4" data-testid="decision-bar">
      <div className="flex items-center gap-3">
        <span className="avatar h-10 w-10">
          <DecisionIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-base font-semibold">Record decision</p>
          <p className="text-xs text-muted">
            as @{userLogin}
            {current ? ` · current: ${current}` : ""}
          </p>
        </div>
      </div>
      {blockedReason ? (
        <p className="min-w-0 flex-1 text-sm text-attention">{blockedReason}</p>
      ) : (
        <>
          <fieldset className="flex min-w-0 flex-1 flex-wrap gap-x-10 gap-y-3">
            <legend className="sr-only">Decision</legend>
            {OPTIONS.map((o) => {
              const disabled = o.value === "accept" && acceptBlocked !== null;
              return (
                <label key={o.value} className={`flex items-start gap-2.5 ${disabled ? "text-muted" : "cursor-pointer"}`}>
                  <input type="radio" name="choice" value={o.value} required disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span>
                    <span className="block text-sm font-semibold">{o.label}</span>
                    <span className="block text-xs text-muted">{disabled ? acceptBlocked : o.note}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <button type="submit" className="btn btn-primary h-9 px-4">
            Continue to notes
          </button>
        </>
      )}
    </form>
  );
}
