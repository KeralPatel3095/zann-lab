import { getSql } from "../db/sql";
import { canViewClinicIdentity, type Actor, type StaffRole } from "../privacy";
import { verifyPassword } from "./password";

const attempts = new Map<string, { count: number; reset: number }>();

export async function verifyLocalLogin(email: string, password: string): Promise<Actor | null> {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.reset > now && current.count >= 10) return null;
  const sql = await getSql();
  const [row] = await sql<{
    id: string;
    full_name: string;
    role: StaffRole;
    active: boolean;
    can_view_clinic_identity: boolean;
    password_hash: string;
  }[]>`
    select p.id, p.full_name, p.role::text as role, p.active, p.can_view_clinic_identity, c.password_hash
    from profiles p
    join local_credentials c on c.user_id = p.id
    where lower(p.email) = ${key}
  `;
  const valid = row ? await verifyPassword(password, row.password_hash) : false;
  if (!row || !row.active || !valid) {
    const next = !current || current.reset <= now ? { count: 1, reset: now + 15 * 60 * 1000 } : { count: current.count + 1, reset: current.reset };
    attempts.set(key, next);
    return null;
  }
  attempts.delete(key);
  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    active: row.active,
    canViewClinicIdentity: canViewClinicIdentity({ role: row.role, canViewClinicIdentity: row.can_view_clinic_identity }),
  };
}
