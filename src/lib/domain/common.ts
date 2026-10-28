import { DateTime } from "luxon";
import type { Actor, ClinicIdentity, StaffRole } from "../privacy";
import { canViewClinicIdentity, redactClinicIdentity } from "../privacy";
import type { LabCalendar } from "../scheduling/calendar";
import { LAB_ZONE } from "../scheduling/calendar";
import { composeTaskNotification, type TaskNotice } from "../notifications/compose";
import { safeDatabaseMessage, withUser, type Tx } from "../db/sql";

export type ActionResult<T extends object = { status?: undefined }> =
  | ({ ok: true } & T)
  | { ok: false; message: string; reasons?: string[] };

export async function requireActor(tx: Tx, userId: string): Promise<Actor> {
  const [row] = await tx<{
    id: string;
    full_name: string;
    role: StaffRole;
    active: boolean;
    can_view_clinic_identity: boolean;
  }[]>`
    select id, full_name, role::text as role, active, can_view_clinic_identity
    from profiles
    where id = ${userId}
  `;
  if (!row?.active) throw new Error("Not allowed");
  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    active: row.active,
    canViewClinicIdentity: row.can_view_clinic_identity,
  };
}

export async function runAs<T>(
  userId: string,
  fn: (tx: Tx, actor: Actor) => Promise<T>,
  options?: { scheduling?: boolean },
): Promise<T> {
  return withUser(userId, async (tx) => fn(tx, await requireActor(tx, userId)), options);
}

export function fail(error: unknown): { ok: false; message: string } {
  const message = safeDatabaseMessage(error);
  if (process.env.VITEST && error instanceof Error) {
    const extra = error as Error & { detail?: string; where?: string; hint?: string; routine?: string };
    return { ok: false, message: `${message} :: ${error.message} :: ${extra.routine ?? ""} :: ${extra.where ?? ""} :: ${extra.detail ?? ""}` };
  }
  return { ok: false, message };
}

export async function loadCalendar(tx: Tx): Promise<LabCalendar> {
  const hours = await tx<{ weekday: number; start_minute: number; end_minute: number }[]>`
    select weekday, start_minute, end_minute from business_hours where active order by weekday
  `;
  const overrides = await tx<{ calendar_date: string; is_working_day: boolean }[]>`
    select calendar_date::text as calendar_date, is_working_day from business_calendar
  `;
  const zone = await setting(tx, "timezone");
  return {
    zone: zone || LAB_ZONE,
    hours: hours.map((row) => ({ weekday: row.weekday, startMinute: row.start_minute, endMinute: row.end_minute })),
    overrides: overrides.map((row) => ({ date: row.calendar_date, isWorkingDay: row.is_working_day })),
  };
}

export async function setting(tx: Tx, key: string) {
  const [row] = await tx<{ setting_value: string }[]>`
    select setting_value from production_settings where setting_key = ${key}
  `;
  return row?.setting_value ?? "";
}

export async function clinicForCase(tx: Tx, actor: Actor, caseId: string): Promise<ClinicIdentity | null> {
  if (!canViewClinicIdentity(actor)) return null;
  const [row] = await tx<{
    dentist_name: string;
    clinic_name: string;
    email: string;
    phone: string;
    billing_notes: string;
  }[]>`
    select a.dentist_name, a.clinic_name, a.email, a.phone, a.billing_notes
    from case_clinic_links l
    join clinic_accounts a on a.id = l.clinic_account_id
    where l.case_id = ${caseId}
  `;
  if (!row) return null;
  return {
    dentistName: row.dentist_name,
    clinicName: row.clinic_name,
    email: row.email,
    phone: row.phone,
    billingNotes: row.billing_notes,
  };
}

export function appHref(path: string) {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

export async function postNotice(
  tx: Tx,
  input: {
    recipientId: string;
    caseId: string | null;
    taskId: string | null;
    type: string;
    key: string | null;
    notice: TaskNotice;
    title?: string;
    clinic: ClinicIdentity | null;
  },
) {
  const safeNotice = {
    ...input.notice,
    instructions: redactClinicIdentity(input.notice.instructions, input.clinic),
    patientName: redactClinicIdentity(input.notice.patientName, input.clinic),
  };
  const composed = composeTaskNotification(safeNotice, new Date(), input.title);
  await tx`
    select app.post_notification(
      ${input.recipientId}::uuid,
      ${input.caseId}::uuid,
      ${input.taskId}::uuid,
      ${input.type},
      ${composed.title},
      ${composed.body},
      ${input.key}
    )
  `;
}

export function stamp(value: Date | null) {
  return value ? DateTime.fromJSDate(value) : null;
}

export async function addCaseEvent(tx: Tx, caseId: string, actorId: string, eventType: string, details: Record<string, string | number | boolean | null>) {
  await tx`
    insert into case_events (case_id, actor_id, event_type, event_details)
    values (${caseId}, ${actorId}, ${eventType}, ${tx.json(details)})
  `;
}

export async function addTaskEvent(tx: Tx, taskId: string, caseId: string, actorId: string, eventType: string, details: Record<string, string | number | boolean | null>) {
  await tx`
    insert into task_events (task_id, case_id, actor_id, event_type, event_details)
    values (${taskId}, ${caseId}, ${actorId}, ${eventType}, ${tx.json(details)})
  `;
}

export function hasRole(actor: Actor, roles: StaffRole[]) {
  return roles.includes(actor.role);
}
