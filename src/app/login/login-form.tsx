"use client";

import { useActionState } from "react";
import { loginAction } from "@/server/actions";
import { SubmitButton } from "@/components/submit-button";

const initial = { error: "" };

const staffLogins = [
  { email: "keral.patel@zann-lab.test", password: "KeralPatel@sept" },
  { email: "ana.bogdanovic@zann-lab.test", password: "AnaBogdanovic@nov" },
  { email: "ned.bogdanovic@zann-lab.test", password: "NedBogdanovic@nov" },
  { email: "zoca.bogdanovic@zann-lab.test", password: "ZocaBogdanovic@nov" },
  { email: "parneet.kaur@zann-lab.test", password: "ParneetKaur@sept" },
  { email: "negar.qureshi@zann-lab.test", password: "Negarqureshi@sept" },
];

export function LoginForm({ seedPassword }: { seedPassword: string }) {
  const [state, action] = useActionState(loginAction, initial);
  return (
    <main className="lab-login">
      <section className="lab-login-panel">
        <div className="lab-login-brand">
          <p className="lab-mark" aria-hidden="true">Z</p>
          <p className="lab-logo">ZANN</p>
          <p className="lab-kicker">Dental laboratory</p>
          <h1>Production desk</h1>
        </div>
        <div className="lab-login-card">
          <h2>Sign in</h2>
          <p className="mt-2 text-sm">Enter the credentials issued for your account.</p>
          <form action={action} className="mt-6 grid gap-3">
            <label>Email<input name="email" type="email" autoComplete="username" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
            {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
            <SubmitButton>Sign in</SubmitButton>
          </form>
          {seedPassword ? (
            <details className="lab-dev-logins mt-6">
              <summary>Development accounts</summary>
              <ul className="mt-3 grid gap-1.5">
                {staffLogins.map((person) => (
                  <li key={person.email}>
                    <span>{person.email}</span>
                    <span className="lab-dev-pass">{person.password}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </section>
    </main>
  );
}
