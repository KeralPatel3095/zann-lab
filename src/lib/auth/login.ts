import { getSql } from "../db/sql";
import { canViewClinicIdentity, type Actor, type StaffRole } from "../privacy";
import { verifyPassword } from "./password";

const attempts = new Map<string, { count: number; reset: number }>();

export type LoginFailure = { ok: false; error: string };
export type LoginSuccess = { ok: true; user: Actor };
export type LoginResult = LoginSuccess | LoginFailure;

export async function verifyLocalLogin(email: string, password: string): Promise<Actor | null> {
  const result = await attemptLocalLogin(email, password);
  return result.ok ? result.user : null;
}

export async function attemptLocalLogin(email: string, password: string): Promise<LoginResult> {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.reset > now && current.count >= 10) {
    return { ok: false, error: "Too many sign-in attempts. Wait a few minutes and try again." };
  }
  try {
    const sql = await getSql();
    const [row] = await sql<{
      id: string;
      full_name: string;
      role: StaffRole;
      job_title: string;
      active: boolean;
      can_view_clinic_identity: boolean;
      password_hash: string;
    }[]>`
      select p.id, p.full_name, p.role::text as role, coalesce(p.job_title, '') as job_title, p.active, p.can_view_clinic_identity, c.password_hash
      from profiles p
      join local_credentials c on c.user_id = p.id
      where lower(p.email) = ${key}
    `;
    const valid = row ? await verifyPassword(password, row.password_hash) : false;
    if (!row || !row.active || !valid) {
      const next = !current || current.reset <= now ? { count: 1, reset: now + 15 * 60 * 1000 } : { count: current.count + 1, reset: current.reset };
      attempts.set(key, next);
      return { ok: false, error: "Those credentials were not recognized." };
    }
    attempts.delete(key);
    return {
      ok: true,
      user: {
        id: row.id,
        fullName: row.full_name,
        email: key,
        role: row.role,
        jobTitle: row.job_title,
        active: row.active,
        canViewClinicIdentity: canViewClinicIdentity({
          email: key,
          role: row.role,
          canViewClinicIdentity: row.can_view_clinic_identity,
        }),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/too many clients|max clients|EMAXCONN|connection|ECONNREFUSED|timeout|does not exist/i.test(message)) {
      return { ok: false, error: "The lab database is busy or unavailable. Wait a minute and try again." };
    }
    return { ok: false, error: "Sign-in could not be completed. Try again." };
  }
}
