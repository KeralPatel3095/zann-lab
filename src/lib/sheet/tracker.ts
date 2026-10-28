import { createHash } from "crypto";
import ExcelJS from "exceljs";
import { DateTime } from "luxon";
import { LAB_ZONE } from "../scheduling/calendar";

export type TrackerCase = {
  caseNumber: string;
  patientName: string;
  officeName: string;
  panNumber: string;
  caseType: string;
  status: string;
  dueRaw: string;
  dueOn: string | null;
  notes: string;
  receivedOn: string | null;
  fingerprint: string;
};

export type TrackerPickup = {
  sheetName: string;
  pickupOn: string | null;
  detail: string;
  fingerprint: string;
};

export type TrackerWorkbook = {
  cases: TrackerCase[];
  pickups: TrackerPickup[];
};

const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export async function parseTrackerWorkbook(bytes: Uint8Array): Promise<TrackerWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
  const cases = new Map<string, TrackerCase>();
  const pickups: TrackerPickup[] = [];
  for (const sheet of workbook.worksheets) {
    if (/pickup/i.test(sheet.name)) {
      pickups.push(...readPickups(sheet));
      continue;
    }
    if (!months.includes(sheet.name.trim().toLowerCase())) continue;
    for (const row of readCases(sheet)) cases.set(row.caseNumber.toLowerCase(), row);
  }
  return { cases: [...cases.values()], pickups };
}

export function officeCode(officeName: string) {
  const digest = createHash("sha1").update(officeName.trim().toLowerCase()).digest("hex").slice(0, 10);
  return `ct-${digest}`;
}

export function spreadsheetIdFromInput(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

function readCases(sheet: ExcelJS.Worksheet) {
  const header = findHeader(sheet);
  if (!header) return [];
  const rows: TrackerCase[] = [];
  let receivedOn: string | null = null;
  for (let rowNumber = header.row + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const patient = clip(cellText(row.getCell(header.patient).value), 160);
    const office = clip(cellText(row.getCell(header.office).value), 160);
    const pan = clip(cellText(row.getCell(header.pan).value), 40);
    const caseType = clip(cellText(row.getCell(header.type).value), 80);
    const status = clip(cellText(row.getCell(header.status).value), 80);
    const dueCell = row.getCell(header.due).value;
    const notes = clip(cellText(row.getCell(header.notes).value), 2000);
    const caseCell = row.getCell(header.caseNumber).value;
    if (!patient && !office && !pan && !caseType && !status && !notes) {
      const section = dateOnly(caseCell);
      if (section) receivedOn = section;
      continue;
    }
    if (!patient || patient.toLowerCase() === "patient name") continue;
    const caseNumber = clip(caseIdentifier(caseCell), 40);
    if (!caseNumber || dateOnly(caseCell)) continue;
    const dueOn = dateOnly(dueCell) ?? parseDueText(cellText(dueCell), receivedOn);
    const dueRaw = dateOnly(dueCell) ?? clip(cellText(dueCell), 160);
    const record = {
      caseNumber,
      patientName: patient,
      officeName: office,
      panNumber: pan,
      caseType,
      status,
      dueRaw,
      dueOn,
      notes: scrubOffice(notes, office),
      receivedOn,
    };
    rows.push({ ...record, fingerprint: fingerprint(record) });
  }
  return rows;
}

function readPickups(sheet: ExcelJS.Worksheet) {
  const rows: TrackerPickup[] = [];
  let pickupOn: string | null = null;
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const parts: string[] = [];
    for (let column = 1; column <= Math.min(sheet.columnCount, 8); column += 1) {
      const value = row.getCell(column).value;
      if (column === 1 && dateOnly(value) && !cellText(row.getCell(2).value)) {
        pickupOn = dateOnly(value);
        parts.length = 0;
        break;
      }
      const text = clip(cellText(value), 200);
      if (text) parts.push(text);
    }
    const detail = clip(parts.join(" · "), 500);
    if (!detail || months.includes(detail.toLowerCase())) continue;
    if (dateOnly(row.getCell(1).value) && parts.length <= 1) continue;
    const fingerprint = createHash("sha1").update([sheet.name, pickupOn ?? "", detail].join("\u001f")).digest("hex");
    rows.push({ sheetName: clip(sheet.name, 80), pickupOn, detail, fingerprint });
  }
  return rows;
}

function findHeader(sheet: ExcelJS.Worksheet) {
  const limit = Math.min(sheet.rowCount, 8);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    for (let column = 1; column <= Math.min(sheet.columnCount, 20); column += 1) {
      if (cellText(row.getCell(column).value).toLowerCase() !== "patient name") continue;
      return {
        row: rowNumber,
        caseNumber: Math.max(1, column - 1),
        patient: column,
        office: column + 1,
        pan: column + 2,
        type: column + 3,
        status: column + 4,
        due: column + 5,
        notes: column + 6,
      };
    }
  }
  return null;
}

function fingerprint(row: Omit<TrackerCase, "fingerprint">) {
  return createHash("sha1")
    .update([row.caseNumber, row.patientName, row.officeName, row.panNumber, row.caseType, row.status, row.dueOn ?? "", row.dueRaw, row.notes, row.receivedOn ?? ""].join("\u001f"))
    .digest("hex");
}

function caseIdentifier(value: ExcelJS.CellValue) {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  const text = cellText(value);
  return /^\d+\.0$/.test(text) ? text.slice(0, -2) : text;
}

function dateOnly(value: ExcelJS.CellValue) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = cellText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const named = text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  if (!named) return null;
  const parsed = DateTime.fromFormat(`${named[1]} ${named[2]} 2026`, "LLLL d yyyy", { zone: LAB_ZONE });
  if (parsed.isValid) return parsed.toISODate();
  const short = DateTime.fromFormat(`${named[1]} ${named[2]} 2026`, "LLL d yyyy", { zone: LAB_ZONE });
  return short.isValid ? short.toISODate() : null;
}

function parseDueText(raw: string, receivedOn: string | null) {
  const text = raw.trim();
  if (!text) return null;
  const year = receivedOn?.slice(0, 4) ?? "2026";
  const formats = ["M/d/yyyy", "M/d/yy", "yyyy-MM-dd", "d LLL yyyy", "LLL d yyyy", "LLLL d yyyy", "LLL d", "LLLL d", "d LLL", "d LLLL"];
  for (const format of formats) {
    const parsed = DateTime.fromFormat(text, format, { zone: LAB_ZONE });
    if (!parsed.isValid) continue;
    const withYear = format.includes("y") ? parsed : parsed.set({ year: Number(year) });
    if (withYear.isValid) return withYear.toISODate();
  }
  const dayFirst = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\b/i);
  if (dayFirst) {
    const parsed = namedDate(dayFirst[1], dayFirst[2], year);
    if (parsed) return parsed;
  }
  const monthFirst = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (!monthFirst) return null;
  return namedDate(monthFirst[2], monthFirst[1], year);
}

function namedDate(day: string, month: string, year: string) {
  const parsed = DateTime.fromFormat(`${day} ${month} ${year}`, "d LLL yyyy", { zone: LAB_ZONE });
  if (parsed.isValid) return parsed.toISODate();
  const long = DateTime.fromFormat(`${day} ${month} ${year}`, "d LLLL yyyy", { zone: LAB_ZONE });
  return long.isValid ? long.toISODate() : null;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").replace(/\s+/g, " ").trim();
    if ("text" in value && value.text != null) return String(value.text).replace(/\s+/g, " ").trim();
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
  }
  return String(value).replace(/\s+/g, " ").trim();
}

function scrubOffice(notes: string, officeName: string) {
  if (officeName.trim().length < 8) return notes;
  const pattern = new RegExp(officeName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
  return notes.replace(pattern, " ").replace(/\s+/g, " ").trim();
}

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}
