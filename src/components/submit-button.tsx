"use client";

import { useFormStatus } from "react-dom";

/** A submit button that shows a waiting label while its form's server action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
