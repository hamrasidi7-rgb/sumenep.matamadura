"use client";

import { useActionState, useState } from "react";

import { Notice } from "@/components/admin/Notice";
import { SubmitButton } from "@/components/admin/SubmitButton";

import { loginAction, type LoginState } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});
  // Controlled, so the email survives React's form reset after a failed attempt;
  // the password field stays uncontrolled and is cleared every time.
  const [email, setEmail] = useState("");
  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}

      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="email" className="block text-sm font-semibold">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
          className="admin-input mt-1.5"
        />
        {emailError && (
          <p id="email-error" className="mt-1.5 text-sm text-brand-deep">
            {emailError}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-semibold">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "password-error" : undefined}
          className="admin-input mt-1.5"
        />
        {passwordError && (
          <p id="password-error" className="mt-1.5 text-sm text-brand-deep">
            {passwordError}
          </p>
        )}
      </div>

      <SubmitButton pendingLabel="Memeriksa…" className="admin-button w-full">
        Masuk
      </SubmitButton>
    </form>
  );
}
