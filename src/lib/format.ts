import { DateTime } from "luxon";
import { LAB_ZONE } from "./scheduling/calendar";

export function formatStamp(value: Date | string | null | undefined, zone = LAB_ZONE) {
  if (!value) return "—";
  const parsed = value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromISO(value);
  if (!parsed.isValid) return "—";
  return parsed.setZone(zone).toFormat("ccc d LLL yyyy, t");
}
