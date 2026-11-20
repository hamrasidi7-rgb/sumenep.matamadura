"use client";

import { useActionState } from "react";

import { Notice } from "@/components/admin/Notice";
import { SubmitButton } from "@/components/admin/SubmitButton";

import { changePasswordAction, type PasswordState } from "../../actions";

const FIELDS = [
  { name: "currentPassword", label: "Password saat ini", autoComplete: "current-password" },
  { name: "newPassword", label: "Password baru", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Ulangi password baru", autoComplete: "new-password" },
] as const;

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<PasswordState, FormData>(changePasswordAction, {});

  return (
    <form action={formAction} className="mt-5 space-y-4" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {FIELDS.map((field) => {
        const error = state.fieldErrors?.[field.name];
        return (
          <div key={field.name}>
            <label htmlFor={field.name} className="block text-sm font-semibold">
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type="password"
              autoComplete={field.autoComplete}
              required
              maxLength={256}
              minLength={field.name === "currentPassword" ? undefined : 15}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${field.name}-error` : undefined}
              className="admin-input mt-1.5"
            />
            {error && (
              <p id={`${field.name}-error`} className="mt-1.5 text-sm text-brand-deep">
                {error}
              </p>
            )}
          </div>
        );
      })}
      <SubmitButton pendingLabel="Menyimpan…">Ganti password</SubmitButton>
    </form>
  );
}
