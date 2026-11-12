import { DateTime } from "luxon";
import { canMarkBenchFinish, canSeeFinishedBoard, canSeeProductionReport, caseIsNegarProduct } from "../bench-board";
import { PRODUCT_OWNERS } from "../product-routing";
import { canViewClinicIdentity } from "../privacy";
import { LAB_ZONE } from "../scheduling/calendar";
import { addCaseEvent, fail, runAs, type ActionResult } from "./common";
import type { Tx } from "../db/sql";

export type FinishedCaseRow = {
  id: string;
  case_number: string;
  patient_name: string;
  pan_number: string;
  case_type: string;
  overall_status: string;
  tracker_status: string;
  tracker_due: string;
  requested_delivery_at: Date | null;
  dentist_code: string;
  clinic_name: string | null;
  finished_at: Date;
  work_date: string;
  technician_name: string;
};

function hideClinic(rows: FinishedCaseRow[], showClinic: boolean) {
  if (showClinic) return rows;
  return rows.map((row) => ({ ...row, clinic_name: null }));
}

async function finishesOnDay(tx: Tx, day: string, technicianEmail: string) {
  return tx<FinishedCaseRow[]>`
    select c.id, c.case_number, c.patient_name, c.pan_number, c.case_type,
           c.overall_status::text as overall_status, c.tracker_status, c.tracker_due,
           c.requested_delivery_at, c.dentist_code,
           a.clinic_name,
           f.finished_at, f.work_date::text as work_date, p.full_name as technician_name
    from case_bench_finishes f
    join cases c on c.id = f.case_id
    join profiles p on p.id = f.finished_by
    left join case_clinic_links l on l.case_id = c.id
    left join clinic_accounts a on a.id = l.clinic_account_id
    where f.work_date = ${day}::date
      and lower(p.email) = ${technicianEmail}
    order by f.finished_at desc, c.case_number
  `;
}

export async function finishBenchCase(userId: string, caseId: string): Promise<ActionResult> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (!canMarkBenchFinish(actor)) return { ok: false, message: "Only Negar can finish a case from the bench." };
      const [row] = await tx<{ id: string; case_type: string; overall_status: string; historical: boolean }[]>`
        select id, case_type, overall_status::text as overall_status, historical
        from cases
        where id = ${caseId}
      `;
      if (!row) return { ok: false, message: "Case not found." };
      if (!caseIsNegarProduct(row.case_type)) return { ok: false, message: "This case is not on Negar's bench." };
      if (row.historical || row.overall_status !== "in_production") {
        return { ok: false, message: "Only a case that is still in the lab can be finished." };
      }
      const [existing] = await tx<{ id: string }[]>`
        select id from case_bench_finishes where case_id = ${caseId}
      `;
      if (existing) return { ok: false, message: "This case is already finished." };
      const inserted = await tx<{ id: string }[]>`
        insert into case_bench_finishes (case_id, finished_by, work_date)
        values (${caseId}, ${actor.id}, (now() at time zone ${LAB_ZONE})::date)
        returning id
      `;
      if (!inserted.length) return { ok: false, message: "This case could not be finished." };
      await addCaseEvent(tx, caseId, actor.id, "bench_finished", { technician: actor.fullName });
      return { ok: true as const };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/case_bench_finishes_case_id_key|duplicate key/i.test(message)) {
      return { ok: false, message: "This case is already finished." };
    }
    return fail(error);
  }
}

/** Today's finishes for Ana, Keral, and Parneet. Null when this person does not receive that board. */
export async function listFinishedBoard(userId: string) {
  return runAs(userId, async (tx, actor) => {
    if (!canSeeFinishedBoard(actor)) return null;
    const today = DateTime.now().setZone(LAB_ZONE).toISODate() ?? "";
    const rows = await finishesOnDay(tx, today, PRODUCT_OWNERS.negar);
    return hideClinic(rows, canViewClinicIdentity(actor));
  });
}

/** Cases Negar has sent today, so she can see they left her open list. */
export async function listMyFinishesToday(userId: string) {
  return runAs(userId, async (tx, actor) => {
    if (!canMarkBenchFinish(actor)) return [];
    const today = DateTime.now().setZone(LAB_ZONE).toISODate() ?? "";
    const rows = await finishesOnDay(tx, today, PRODUCT_OWNERS.negar);
    return hideClinic(rows, false);
  });
}

export type ProductionDay = {
  workDate: string;
  label: string;
  cases: FinishedCaseRow[];
};

export async function productionReport(userId: string) {
  return runAs(userId, async (tx, actor) => {
    if (!canSeeProductionReport(actor)) return null;
    const now = DateTime.now().setZone(LAB_ZONE);
    const start = now.minus({ days: 21 }).toISODate() ?? "";
    const end = now.toISODate() ?? "";
    const [tech] = await tx<{ full_name: string }[]>`
      select full_name from profiles where lower(email) = ${PRODUCT_OWNERS.negar} and active
    `;
    const rows = await tx<FinishedCaseRow[]>`
      select c.id, c.case_number, c.patient_name, c.pan_number, c.case_type,
             c.overall_status::text as overall_status, c.tracker_status, c.tracker_due,
             c.requested_delivery_at, c.dentist_code,
             a.clinic_name,
             f.finished_at, f.work_date::text as work_date, p.full_name as technician_name
      from case_bench_finishes f
      join cases c on c.id = f.case_id
      join profiles p on p.id = f.finished_by
      left join case_clinic_links l on l.case_id = c.id
      left join clinic_accounts a on a.id = l.clinic_account_id
      where f.work_date between ${start}::date and ${end}::date
        and lower(p.email) = ${PRODUCT_OWNERS.negar}
      order by f.finished_at desc, c.case_number
    `;
    const visible = hideClinic(rows, canViewClinicIdentity(actor));
    const days: ProductionDay[] = [];
    for (let offset = 0; offset < 21 && days.length < 10; offset += 1) {
      const day = now.minus({ days: offset });
      if (day.weekday > 5) continue;
      const key = day.toISODate() ?? "";
      days.push({
        workDate: key,
        label: day.toFormat("cccc d LLLL"),
        cases: visible.filter((row) => row.work_date === key),
      });
    }
    return { technicianName: tech?.full_name || "Negar", days };
  });
}

export async function benchFinishForCase(userId: string, caseId: string) {
  return runAs(userId, async (tx, actor) => {
    if (!canMarkBenchFinish(actor) && !canSeeFinishedBoard(actor)) return null;
    const [row] = await tx<{ finished_at: Date; work_date: string; technician_name: string }[]>`
      select f.finished_at, f.work_date::text as work_date, p.full_name as technician_name
      from case_bench_finishes f
      join profiles p on p.id = f.finished_by
      where f.case_id = ${caseId}
    `;
    return row ?? null;
  });
}
