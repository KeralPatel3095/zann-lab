import { canSeeProductionReport } from "../bench-board";
import type { Tx } from "../db/sql";
import { LAB_ZONE } from "../scheduling/calendar";
import { fail, runAs, type ActionResult } from "./common";

export type DailyReportItem = {
  id: string;
  caseNumber: string;
  patientName: string;
  caseType: string;
  kind: "worked" | "started";
  note: string;
};

export type DailyReport = {
  id: string;
  workDate: string;
  technicianName: string;
  note: string;
  items: DailyReportItem[];
};

type ItemRow = {
  report_id: string;
  work_date: string;
  report_note: string;
  technician_name: string;
  item_id: string | null;
  case_number: string | null;
  patient_name: string | null;
  case_type: string | null;
  kind: string | null;
  item_note: string | null;
};

function groupReports(rows: ItemRow[]) {
  const reports: DailyReport[] = [];
  for (const row of rows) {
    let report = reports.find((item) => item.id === row.report_id);
    if (!report) {
      report = {
        id: row.report_id,
        workDate: row.work_date,
        technicianName: row.technician_name,
        note: row.report_note,
        items: [],
      };
      reports.push(report);
    }
    if (!row.item_id || (row.kind !== "worked" && row.kind !== "started")) continue;
    report.items.push({
      id: row.item_id,
      caseNumber: row.case_number ?? "",
      patientName: row.patient_name ?? "",
      caseType: row.case_type ?? "",
      kind: row.kind,
      note: row.item_note ?? "",
    });
  }
  return reports;
}

async function ensureTodayReport(tx: Tx, technicianId: string) {
  const [report] = await tx<{ id: string }[]>`
    insert into daily_production_reports (technician_id, work_date)
    values (${technicianId}, (now() at time zone ${LAB_ZONE})::date)
    on conflict (technician_id, work_date) do update set technician_id = excluded.technician_id
    returning id
  `;
  return report?.id ?? "";
}

export async function myDailyReport(userId: string) {
  return runAs(userId, async (tx, actor) => {
    if (actor.role !== "technician") return null;
    const rows = await tx<ItemRow[]>`
      select r.id as report_id, r.work_date::text as work_date, r.note as report_note, p.full_name as technician_name,
             i.id as item_id, coalesce(c.case_number, i.case_number) as case_number, c.patient_name, c.case_type,
             i.kind, i.note as item_note
      from daily_production_reports r
      join profiles p on p.id = r.technician_id
      left join daily_production_items i on i.report_id = r.id
      left join cases c on c.id = i.case_id
      where r.technician_id = ${actor.id}
        and r.work_date = (now() at time zone ${LAB_ZONE})::date
      order by i.created_at
    `;
    return groupReports(rows)[0] ?? { id: "", workDate: "", technicianName: actor.fullName, note: "", items: [] };
  });
}

export async function myReports(userId: string, start: string, end: string) {
  return runAs(userId, async (tx, actor) => {
    if (actor.role !== "technician" || !start || !end) return [];
    const rows = await tx<ItemRow[]>`
      select r.id as report_id, r.work_date::text as work_date, r.note as report_note, p.full_name as technician_name,
             i.id as item_id, coalesce(c.case_number, i.case_number) as case_number, c.patient_name, c.case_type,
             i.kind, i.note as item_note
      from daily_production_reports r
      join profiles p on p.id = r.technician_id
      left join daily_production_items i on i.report_id = r.id
      left join cases c on c.id = i.case_id
      where r.technician_id = ${actor.id}
        and r.work_date between ${start}::date and ${end}::date
      order by i.created_at
    `;
    return groupReports(rows);
  });
}

export async function saveDailyNote(userId: string, note: string): Promise<ActionResult> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (actor.role !== "technician") return { ok: false, message: "Only a technician can write this report." };
      const reportId = await ensureTodayReport(tx, actor.id);
      if (!reportId) return { ok: false, message: "The report could not be saved." };
      await tx`
        update daily_production_reports
        set note = ${note.trim().slice(0, 2000)}, updated_at = now()
        where id = ${reportId}
      `;
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function addDailyItem(userId: string, caseNumber: string, kind: string, note: string): Promise<ActionResult> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (actor.role !== "technician") return { ok: false, message: "Only a technician can write this report." };
      const number = caseNumber.trim().slice(0, 40);
      if (!number) return { ok: false, message: "Enter the case number." };
      if (kind !== "worked" && kind !== "started") return { ok: false, message: "Choose worked on or started." };
      const reportId = await ensureTodayReport(tx, actor.id);
      if (!reportId) return { ok: false, message: "The report could not be saved." };
      const [count] = await tx<{ total: number }[]>`
        select count(*)::int as total from daily_production_items where report_id = ${reportId}
      `;
      if ((count?.total ?? 0) >= 40) return { ok: false, message: "Today's report already has 40 cases." };
      const [found] = await tx<{ id: string; case_number: string }[]>`
        select id, case_number from cases where lower(case_number) = ${number.toLowerCase()} limit 1
      `;
      await tx`
        insert into daily_production_items (report_id, case_id, case_number, kind, note)
        values (${reportId}, ${found?.id ?? null}, ${found?.case_number ?? number}, ${kind}, ${note.trim().slice(0, 500)})
      `;
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function removeDailyItem(userId: string, itemId: string): Promise<ActionResult> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (actor.role !== "technician") return { ok: false, message: "Only a technician can change this report." };
      const removed = await tx<{ id: string }[]>`
        delete from daily_production_items
        where id = ${itemId}
        returning id
      `;
      if (!removed.length) return { ok: false, message: "That line is not on today's report." };
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function productionReports(userId: string, start: string, end: string) {
  return runAs(userId, async (tx, actor) => {
    if (!canSeeProductionReport(actor)) return [];
    if (!start || !end) return [];
    const rows = await tx<ItemRow[]>`
      select r.id as report_id, r.work_date::text as work_date, r.note as report_note, p.full_name as technician_name,
             i.id as item_id, coalesce(c.case_number, i.case_number) as case_number, c.patient_name, c.case_type,
             i.kind, i.note as item_note
      from daily_production_reports r
      join profiles p on p.id = r.technician_id
      left join daily_production_items i on i.report_id = r.id
      left join cases c on c.id = i.case_id
      where r.work_date between ${start}::date and ${end}::date
      order by p.full_name, i.created_at
    `;
    return groupReports(rows);
  });
}
