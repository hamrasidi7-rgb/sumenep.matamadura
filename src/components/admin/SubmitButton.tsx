"use client";

import { useFormStatus } from "react-dom";

/** Submit button that disables itself while the Server Action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  className = "admin-button",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
