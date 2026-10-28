import { hashPassword, verifyPassword } from "../auth/password";
import { getSql } from "../db/sql";
import type { StaffRole } from "../privacy";
import { fail, hasRole, runAs, type ActionResult } from "./common";

const roles = new Set<StaffRole>(["administrator", "front_desk", "technician", "department_lead", "production_manager"]);

export async function createStaff(actorId: string, input: {
  fullName: string;
  email: string;
  role: StaffRole;
  password: string;
  departmentId?: string;
  lead?: boolean;
  canViewClinicIdentity?: boolean;
  capacityMinutes?: number;
}): Promise<ActionResult> {
  try {
    const actor = await runAs(actorId, async (_tx, current) => current);
    if (!hasRole(actor, ["administrator"])) return { ok: false, message: "Not allowed" };
    if (!roles.has(input.role)) return { ok: false, message: "Choose a valid role." };
    if (input.password.length < 10) return { ok: false, message: "Use a password of at least 10 characters." };
    const clinic = input.role === "technician" ? false : input.role === "administrator" || input.role === "front_desk" ? true : Boolean(input.canViewClinicIdentity);
    const passwordHash = await hashPassword(input.password);
    const sql = await getSql();
    const [profile] = await sql<{ id: string }[]>`
      insert into profiles (full_name, email, role, can_view_clinic_identity, daily_capacity_minutes)
      values (${input.fullName.trim()}, ${input.email.trim().toLowerCase()}, ${input.role}::app_role, ${clinic}, ${input.capacityMinutes ?? 420})
      returning id
    `;
    await sql`insert into local_credentials (user_id, password_hash) values (${profile.id}, ${passwordHash})`;
    if (input.departmentId) {
      await sql`
        insert into department_members (department_id, user_id, membership_role)
        values (${input.departmentId}, ${profile.id}, ${input.lead || input.role === "department_lead" ? "lead" : "member"}::membership_role)
      `;
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("profiles_email")) return { ok: false, message: "That email already has an account. Each person needs their own email." };
    return fail(error);
  }
}

export async function changeOwnPassword(actorId: string, currentPassword: string, nextPassword: string): Promise<ActionResult> {
  try {
    const actor = await runAs(actorId, async (_tx, current) => current);
    if (nextPassword.length < 10) return { ok: false, message: "Use a password of at least 10 characters." };
    if (nextPassword === currentPassword) return { ok: false, message: "Choose a password that is different from the current one." };
    const sql = await getSql();
    const [row] = await sql<{ password_hash: string }[]>`
      select password_hash from local_credentials where user_id = ${actor.id}
    `;
    if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
      return { ok: false, message: "The current password is not correct." };
    }
    await sql`
      update local_credentials
      set password_hash = ${await hashPassword(nextPassword)}, updated_at = now()
      where user_id = ${actor.id}
    `;
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setStaffPassword(actorId: string, userId: string, password: string): Promise<ActionResult> {
  try {
    const actor = await runAs(actorId, async (_tx, current) => current);
    if (!hasRole(actor, ["administrator"])) return { ok: false, message: "Not allowed" };
    if (password.length < 10) return { ok: false, message: "Use a password of at least 10 characters." };
    const sql = await getSql();
    const [person] = await sql<{ id: string }[]>`select id from profiles where id = ${userId} and active`;
    if (!person) return { ok: false, message: "That account was not found." };
    const hash = await hashPassword(password);
    await sql`
      insert into local_credentials (user_id, password_hash)
      values (${person.id}, ${hash})
      on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now()
    `;
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setStaffActive(actorId: string, userId: string, active: boolean): Promise<ActionResult> {
  try {
    return await runAs(actorId, async (tx, actor) => {
      if (actor.role !== "administrator") return { ok: false, message: "Not allowed" };
      if (actor.id === userId && !active) return { ok: false, message: "You cannot disable your own account." };
      await tx`update profiles set active = ${active} where id = ${userId}`;
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function updateStage(actorId: string, stageId: string, input: { workMinutes: number; elapsedMinutes: number; skippable: boolean; active: boolean }): Promise<ActionResult> {
  try {
    return await runAs(actorId, async (tx, actor) => {
      if (actor.role !== "administrator") return { ok: false, message: "Not allowed" };
      await tx`
        update workflow_stages
        set estimated_work_minutes = ${input.workMinutes}, elapsed_minutes = ${input.elapsedMinutes},
            skippable = ${input.skippable}, active = ${input.active}
        where id = ${stageId}
      `;
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function updateSetting(actorId: string, key: string, value: string): Promise<ActionResult> {
  try {
    return await runAs(actorId, async (tx, actor) => {
      if (actor.role !== "administrator") return { ok: false, message: "Not allowed" };
      const allowed = new Set(["reminder_local_time", "dispatch_buffer_minutes", "due_soon_hours", "email_notifications_enabled", "email_include_patient_details", "case_number_prefix"]);
      if (!allowed.has(key)) return { ok: false, message: "That setting cannot be changed here." };
      await tx`update production_settings set setting_value = ${value}, updated_by = ${actor.id}, updated_at = now() where setting_key = ${key}`;
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function saveHoliday(actorId: string, date: string, working: boolean, description: string): Promise<ActionResult> {
  try {
    return await runAs(actorId, async (tx, actor) => {
      if (actor.role !== "administrator") return { ok: false, message: "Not allowed" };
      await tx`
        insert into business_calendar (calendar_date, is_working_day, description)
        values (${date}, ${working}, ${description.slice(0, 160)})
        on conflict (calendar_date) do update set is_working_day = excluded.is_working_day, description = excluded.description
      `;
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function saveDepartment(actorId: string, input: { id?: string; name: string; description: string; active: boolean }): Promise<ActionResult> {
  try {
    return await runAs(actorId, async (tx, actor) => {
      if (actor.role !== "administrator") return { ok: false, message: "Not allowed" };
      if (input.id) {
        await tx`update departments set name = ${input.name}, description = ${input.description}, active = ${input.active} where id = ${input.id}`;
      } else {
        await tx`insert into departments (name, description, active) values (${input.name}, ${input.description}, ${input.active})`;
      }
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function adminSnapshot(actorId: string) {
  return runAs(actorId, async (tx, actor) => {
    if (actor.role !== "administrator") return null;
    const [staff, departments, settings, stages, holidays] = await Promise.all([
      tx<{ id: string; full_name: string; email: string; role: string; active: boolean; can_view_clinic_identity: boolean }[]>`
        select id, full_name, email, role::text as role, active, can_view_clinic_identity from profiles
        where email <> 'scheduler@zann-lab.internal' order by full_name
      `,
      tx<{ id: string; name: string; description: string; active: boolean }[]>`select id, name, description, active from departments order by sort_order, name`,
      tx<{ setting_key: string; setting_value: string }[]>`select setting_key, setting_value from production_settings order by setting_key`,
      tx<{ id: string; stage_name: string; template_name: string; estimated_work_minutes: number; elapsed_minutes: number; skippable: boolean; active: boolean }[]>`
        select s.id, s.stage_name, t.name as template_name, s.estimated_work_minutes, s.elapsed_minutes, s.skippable, s.active
        from workflow_stages s join workflow_templates t on t.id = s.workflow_template_id
        order by t.name, s.sequence
      `,
      tx<{ calendar_date: string; is_working_day: boolean; description: string }[]>`
        select calendar_date::text as calendar_date, is_working_day, description from business_calendar order by calendar_date
      `,
    ]);
    return { staff, departments, settings, stages, holidays };
  });
}
