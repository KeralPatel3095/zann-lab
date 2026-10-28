import ExcelJS from "exceljs";
import { DateTime } from "luxon";
import { LAB_ZONE } from "../scheduling/calendar";
import { classifyImportRow, mapRow, suggestMapping, type ImportField } from "../import/rows";
import { exportColumnsFor } from "../privacy";
import { createCase, type CaseInput } from "./cases";
import { fail, runAs, type ActionResult } from "./common";

export async function previewSpreadsheet(userId: string, filename: string, bytes: Buffer) {
  return runAs(userId, async (tx, actor) => {
    if (actor.role !== "administrator" && actor.role !== "front_desk") return { ok: false as const, message: "Not allowed" };
    const parsed = await readTable(filename, bytes);
    const mapping = suggestMapping(parsed.headers);
    const existing = await tx<{ case_number: string }[]>`select case_number from cases`;
    const known = new Set(existing.map((row) => row.case_number.toLowerCase()));
    const rows = parsed.rows.map((values, index) => {
      const mapped = mapRow(parsed.headers, values, mapping);
      const result = classifyImportRow(mapped, known, "skip_existing");
      return { rowNumber: index + 2, values, mapped, ...result };
    });
    return { ok: true as const, headers: parsed.headers, mapping, rows: rows.slice(0, 50), total: rows.length };
  });
}

export async function commitImport(userId: string, filename: string, bytes: Buffer, mapping: Record<string, ImportField | "">, mode: "skip_existing" | "fill_blanks", historical: boolean): Promise<ActionResult<{ created: number; duplicates: number; invalid: number; updated: number }>> {
  try {
    const actor = await runAs(userId, async (_tx, current) => current);
    if (actor.role !== "administrator" && actor.role !== "front_desk") return { ok: false, message: "Not allowed" };
    const parsed = await readTable(filename, bytes);
    const summary = { created: 0, duplicates: 0, invalid: 0, updated: 0 };
    for (const values of parsed.rows) {
      const mapped = mapRow(parsed.headers, values, mapping);
      const existing = await runAs(userId, async (tx) => {
        if (!mapped.case_number) return false;
        const [row] = await tx<{ id: string }[]>`select id from cases where lower(case_number) = lower(${mapped.case_number})`;
        return Boolean(row);
      });
      const decision = classifyImportRow(mapped, new Set(existing && mapped.case_number ? [mapped.case_number.toLowerCase()] : []), mode);
      if (decision.disposition === "invalid") {
        summary.invalid += 1;
        continue;
      }
      if (decision.disposition === "duplicate") {
        summary.duplicates += 1;
        continue;
      }
      if (decision.disposition === "update" && mode === "fill_blanks") {
        summary.updated += 1;
        await runAs(userId, async (tx) => {
          const [row] = await tx<{ id: string; patient_name: string; pan_number: string; prescription: string }[]>`
            select id, patient_name, pan_number, prescription from cases where lower(case_number) = lower(${mapped.case_number ?? ""})
          `;
          if (!row) return;
          await tx`
            update cases
            set patient_name = case when patient_name = '' then ${mapped.patient_name ?? ""} else patient_name end,
                pan_number = case when pan_number = '' then ${mapped.pan_number ?? ""} else pan_number end,
                prescription = case when prescription = '' then ${mapped.prescription ?? ""} else prescription end
            where id = ${row.id}
          `;
        });
        continue;
      }
      const input: CaseInput = {
        caseNumber: mapped.case_number,
        dentistCode: mapped.dentist_code ?? "",
        patientName: mapped.patient_name ?? "",
        panNumber: mapped.pan_number ?? "",
        workflowTemplateId: "",
        restorationType: mapped.case_type ?? "",
        prescription: mapped.prescription ?? "",
        requiredRecords: "",
        specialHandling: "",
        receivedAt: normalizeImportedWhen(mapped.received_at ?? ""),
        requestedDeliveryAt: normalizeImportedWhen(mapped.requested_delivery_at ?? ""),
        priority: mapped.priority?.toLowerCase() === "rush" ? "rush" : "normal",
        rush: mapped.priority?.toLowerCase() === "rush",
        hold: false,
        holdReason: "",
        excludedStageIds: [],
        units: [{ toothNumber: mapped.tooth_numbers ?? "", unitIdentifier: mapped.units ?? "", material: mapped.material ?? "", shade: mapped.shade ?? "", instructions: "" }],
        clinic: null,
      };
      const [template] = await runAs(userId, async (tx) => tx<{ id: string }[]>`
        select id from workflow_templates where case_type = ${mapped.case_type ?? ""} or name = ${mapped.case_type ?? ""} limit 1
      `);
      input.workflowTemplateId = template?.id ?? (await runAs(userId, async (tx) => {
        const [fallback] = await tx<{ id: string }[]>`select id from workflow_templates where case_type = 'other' limit 1`;
        return fallback?.id ?? "";
      }));
      const created = await createCase(userId, input);
      if (!created.ok) summary.invalid += 1;
      else {
        summary.created += 1;
        if (historical) {
          await runAs(userId, async (tx) => {
            await tx`update cases set historical = true where id = ${created.id}`;
          });
        }
      }
    }
    await runAs(userId, async (tx) => {
      await tx`
        insert into import_jobs (uploaded_by, filename, import_status, summary, column_mapping, mode, historical, completed_at)
        values (${userId}, ${filename}, 'completed', ${tx.json(summary)}, ${tx.json(mapping)}, ${mode}, ${historical}, now())
      `;
    });
    return { ok: true, ...summary };
  } catch (error) {
    return fail(error);
  }
}

export async function exportCases(userId: string, format: "xlsx" | "csv") {
  const actor = await runAs(userId, async (_tx, current) => current);
  const columns = exportColumnsFor(actor);
  const rows = await runAs(userId, async (tx) => tx<{
    case_number: string;
    dentist_code: string;
    patient_name: string;
    pan_number: string;
    case_type: string;
    received_at: Date | null;
    requested_delivery_at: Date | null;
    overall_status: string;
    projected_completion_at: Date | null;
    deadline_indicator: string;
    dispatch_status: string;
    priority: string;
  }[]>`
    select case_number, dentist_code, patient_name, pan_number, case_type, received_at, requested_delivery_at,
           overall_status::text as overall_status, projected_completion_at, deadline_indicator::text as deadline_indicator,
           dispatch_status::text as dispatch_status, priority::text as priority
    from cases
    order by created_at desc
    limit 5000
  `);
  const clinicByCase = columns.includes("dentist_name")
    ? await runAs(userId, async (tx) => tx<{ case_number: string; dentist_name: string; clinic_name: string; email: string; phone: string }[]>`
        select c.case_number, a.dentist_name, a.clinic_name, a.email, a.phone
        from cases c
        join case_clinic_links l on l.case_id = c.id
        join clinic_accounts a on a.id = l.clinic_account_id
      `)
    : [];
  const clinics = new Map(clinicByCase.map((row) => [row.case_number, row]));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cases");
  sheet.addRow([...columns]);
  for (const row of rows) {
    const clinic = clinics.get(row.case_number);
    const record: Record<string, string> = {
      case_number: row.case_number,
      dentist_code: row.dentist_code,
      patient_name: row.patient_name,
      pan_number: row.pan_number,
      case_type: row.case_type,
      received_at: row.received_at?.toISOString() ?? "",
      requested_delivery_at: row.requested_delivery_at?.toISOString() ?? "",
      current_department: "",
      current_stage: "",
      overall_status: row.overall_status,
      projected_completion: row.projected_completion_at?.toISOString() ?? "",
      deadline_indicator: row.deadline_indicator,
      dispatch_status: row.dispatch_status,
      priority: row.priority,
      dentist_name: clinic?.dentist_name ?? "",
      clinic_name: clinic?.clinic_name ?? "",
      clinic_email: clinic?.email ?? "",
      clinic_phone: clinic?.phone ?? "",
    };
    sheet.addRow(columns.map((column) => record[column] ?? ""));
  }
  const buffer = format === "csv" ? await workbook.csv.writeBuffer() : await workbook.xlsx.writeBuffer();
  return { filename: format === "csv" ? "cases.csv" : "cases.xlsx", buffer: Buffer.from(buffer) };
}

function normalizeImportedWhen(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const iso = DateTime.fromISO(trimmed, { zone: LAB_ZONE });
  if (iso.isValid) return iso.toISO() ?? "";
  const formats = ["M/d/yyyy", "M/d/yyyy h:mm a", "yyyy-MM-dd HH:mm:ss", "d LLL yyyy"];
  for (const format of formats) {
    const parsed = DateTime.fromFormat(trimmed, format, { zone: LAB_ZONE });
    if (parsed.isValid) return parsed.toISO() ?? "";
  }
  const fallback = DateTime.fromJSDate(new Date(trimmed)).setZone(LAB_ZONE);
  return fallback.isValid ? fallback.toISO() ?? "" : trimmed;
}

async function readTable(filename: string, bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  if (filename.toLowerCase().endsWith(".csv")) {
    const { Readable } = await import("stream");
    await workbook.csv.read(Readable.from(bytes));
  } else {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [] as string[], rows: [] as string[][] };
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, index) => {
    headers[index - 1] = String(cell.text ?? cell.value ?? "").trim();
  });
  const rows: string[][] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = headers.map((_, index) => String(row.getCell(index + 1).text ?? "").trim());
    if (values.some(Boolean)) rows.push(values);
  });
  return { headers, rows };
}
