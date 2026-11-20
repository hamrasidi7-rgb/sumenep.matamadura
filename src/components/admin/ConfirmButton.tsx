"use client";

import { useFormStatus } from "react-dom";

/** Submit button that asks for confirmation first (for actions that sign devices out). */
export function ConfirmButton({
  children,
  question,
  pendingLabel = "Memproses…",
  className = "admin-button-quiet",
}: {
  children: React.ReactNode;
  question: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(question)) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
