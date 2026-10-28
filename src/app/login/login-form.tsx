"use client";

import { useActionState } from "react";
import { loginAction } from "@/server/actions";
import { SubmitButton } from "@/components/submit-button";

const initial = { error: "" };

export function LoginForm({ seedPassword }: { seedPassword: string }) {
  const [state, action] = useActionState(loginAction, initial);
  return (
    <main className="lab-login">
      <section className="lab-login-panel">
        <div className="lab-login-brand">
          <p className="lab-mark" aria-hidden="true">Z</p>
          <p className="lab-logo">ZANN</p>
          <p className="lab-kicker">Dental laboratory</p>
          <h1>Production</h1>
          <p>Case tracking for the bench, from the sheet through finish and pack.</p>
        </div>
        <div className="lab-login-card">
        <h2>Sign in</h2>
        <p className="mt-2 text-sm">Use the email and password set for you.</p>
        <form action={action} className="mt-6 grid gap-3">
          <label>Email<input name="email" type="email" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
          <SubmitButton>Sign in</SubmitButton>
        </form>
        {seedPassword ? (
          <p className="mt-5 text-xs leading-5 text-zinc-500">
            Sample accounts still use the starter password <span className="font-medium text-zinc-800">{seedPassword}</span> until an administrator sets a personal one.
            Front desk: morgan.ellis@zann-lab.test. Administrator: avery.chen@zann-lab.test. Technician: riley.shah@zann-lab.test.
          </p>
        ) : null}
        </div>
      </section>
    </main>
  );
}
