import { DateTime } from "luxon";
import { officeCode } from "./sheet/tracker";
import { LAB_ZONE } from "./scheduling/calendar";

/**
 * Offices that must ship one calendar day before the sheet due so the office
 * receives on the due date. Names stay server-side only; match sheet spellings.
 */
const earlyFinishOfficeCodes = new Set([
  officeCode("Monarch Dentistry - Morrison"),
  officeCode("Monarch Dentistry Morrison"),
]);

/** Calendar days before sheet due that the case must be ready to send. */
export const EARLY_FINISH_DAYS = 1;

export function needsEarlyFinish(dentistCode: string | null | undefined) {
  return Boolean(dentistCode && earlyFinishOfficeCodes.has(dentistCode));
}

/**
 * Send-ready date for finish-today / week-ahead. Sheet due text is unchanged.
 * Example: due 3 Nov → send 2 Nov; workDayBeforeDue then places it on 30 Oct
 * when 31 Oct–1 Nov are weekend.
 */
export function operationalDueAt(dueAt: Date | string | null | undefined, dentistCode: string | null | undefined) {
  if (!dueAt) return null;
  const due = dueAt instanceof Date ? DateTime.fromJSDate(dueAt) : DateTime.fromISO(String(dueAt), { zone: LAB_ZONE });
  if (!due.isValid) return null;
  if (!needsEarlyFinish(dentistCode)) return due;
  return due.minus({ days: EARLY_FINISH_DAYS });
}
