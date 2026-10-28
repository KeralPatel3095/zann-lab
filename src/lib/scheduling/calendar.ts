import { DateTime } from "luxon";

export const LAB_ZONE = "America/Toronto";

export function isEarlyMorningDue(trackerDue: string) {
  const match = trackerDue.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3].toLowerCase().replace(/\./g, "");
  if (meridiem !== "am") return false;
  if (hour === 12) return true;
  return hour < 10 || (hour === 10 && minute === 0);
}

export function workDayBeforeDue(due: DateTime, trackerDue = "") {
  let day = due.setZone(LAB_ZONE).startOf("day");
  const steps = isEarlyMorningDue(trackerDue) ? 2 : 1;
  for (let step = 0; step < steps; step += 1) {
    day = day.minus({ days: 1 });
    while (day.weekday > 5) day = day.minus({ days: 1 });
  }
  return day;
}

export function dueSheetLabel(trackerDue: string, at: Date | string | null) {
  const text = trackerDue.trim();
  if (text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = at instanceof Date ? DateTime.fromJSDate(at) : at ? DateTime.fromISO(at) : null;
  if (parsed?.isValid) return parsed.setZone(LAB_ZONE).toFormat("d LLL");
  return text || "—";
}

export function weekAheadWindow(now: DateTime = DateTime.now()) {
  const today = now.setZone(LAB_ZONE).startOf("day");
  const monday = today.minus({ days: today.weekday - 1 });
  let start = today.plus({ days: 1 });
  while (start.weekday > 5) start = start.plus({ days: 1 });
  const end = monday.plus({ weeks: 1, days: 4 }).startOf("day");
  return { start, end: end < start ? start : end };
}

export type WorkHours = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type DayOverride = {
  date: string;
  isWorkingDay: boolean;
};

export type LabCalendar = {
  zone: string;
  hours: WorkHours[];
  overrides: DayOverride[];
};

export function dayWindow(day: DateTime, calendar: LabCalendar) {
  const zoned = day.setZone(calendar.zone);
  const date = zoned.toISODate();
  const override = calendar.overrides.find((item) => item.date === date);
  if (override && !override.isWorkingDay) return null;
  const hours = calendar.hours.find((item) => item.weekday === zoned.weekday);
  if (override?.isWorkingDay) {
    return hours ? { start: hours.startMinute, end: hours.endMinute } : { start: 480, end: 960 };
  }
  if (!hours) return null;
  return { start: hours.startMinute, end: hours.endMinute };
}

export function previousClose(cursor: DateTime, calendar: LabCalendar) {
  let day = cursor.setZone(calendar.zone).startOf("day").minus({ days: 1 });
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const window = dayWindow(day, calendar);
    if (window) return day.startOf("day").plus({ minutes: window.end });
    day = day.minus({ days: 1 });
  }
  throw new Error("No previous working day");
}

export function nextOpening(cursor: DateTime, calendar: LabCalendar) {
  let day = cursor.setZone(calendar.zone).startOf("day").plus({ days: 1 });
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const window = dayWindow(day, calendar);
    if (window) return day.startOf("day").plus({ minutes: window.start });
    day = day.plus({ days: 1 });
  }
  throw new Error("No next working day");
}

export function alignToWorkingInstant(instant: DateTime, calendar: LabCalendar) {
  let cursor = instant.setZone(calendar.zone).set({ second: 0, millisecond: 0 });
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const window = dayWindow(cursor, calendar);
    const minute = cursor.hour * 60 + cursor.minute;
    if (window && minute > window.start && minute <= window.end) return cursor;
    if (window && minute > window.end) return cursor.startOf("day").plus({ minutes: window.end });
    cursor = previousClose(cursor, calendar);
  }
  throw new Error("No working time");
}

export function moveToWorkingStart(instant: DateTime, calendar: LabCalendar) {
  const cursor = instant.setZone(calendar.zone).set({ second: 0, millisecond: 0 });
  const window = dayWindow(cursor, calendar);
  const minute = cursor.hour * 60 + cursor.minute;
  if (window && minute >= window.start && minute < window.end) return cursor;
  if (window && minute < window.start) return cursor.startOf("day").plus({ minutes: window.start });
  return nextOpening(cursor.minus({ minutes: 1 }), calendar);
}

export function subtractWorkingMinutes(end: DateTime, minutes: number, calendar: LabCalendar) {
  if (minutes <= 0) return end.setZone(calendar.zone).set({ second: 0, millisecond: 0 });
  let cursor = end.setZone(calendar.zone).set({ second: 0, millisecond: 0 });
  let remaining = minutes;
  for (let guard = 0; guard < 20000 && remaining > 0; guard += 1) {
    const window = dayWindow(cursor, calendar);
    const minute = cursor.hour * 60 + cursor.minute;
    if (!window || minute <= window.start) {
      cursor = previousClose(cursor, calendar);
      continue;
    }
    const effective = Math.min(minute, window.end);
    const available = effective - window.start;
    if (available <= 0) {
      cursor = previousClose(cursor, calendar);
      continue;
    }
    if (remaining <= available) {
      return cursor.startOf("day").plus({ minutes: effective - remaining });
    }
    remaining -= available;
    cursor = previousClose(cursor, calendar);
  }
  throw new Error("Not enough working time in the calendar");
}

export function addWorkingMinutes(start: DateTime, minutes: number, calendar: LabCalendar) {
  if (minutes <= 0) return moveToWorkingStart(start, calendar);
  let cursor = moveToWorkingStart(start, calendar);
  let remaining = minutes;
  for (let guard = 0; guard < 20000 && remaining > 0; guard += 1) {
    const window = dayWindow(cursor, calendar);
    if (!window) {
      cursor = nextOpening(cursor, calendar);
      continue;
    }
    const minute = cursor.hour * 60 + cursor.minute;
    if (minute < window.start) {
      cursor = cursor.startOf("day").plus({ minutes: window.start });
      continue;
    }
    if (minute >= window.end) {
      cursor = nextOpening(cursor, calendar);
      continue;
    }
    const available = window.end - minute;
    if (remaining <= available) return cursor.plus({ minutes: remaining }).set({ second: 0, millisecond: 0 });
    remaining -= available;
    cursor = nextOpening(cursor, calendar);
  }
  throw new Error("Not enough working time in the calendar");
}

export function workingMinutesBetween(start: DateTime, end: DateTime, calendar: LabCalendar) {
  const finish = end.setZone(calendar.zone).set({ second: 0, millisecond: 0 });
  let cursor = start.setZone(calendar.zone).set({ second: 0, millisecond: 0 });
  if (finish <= cursor) return 0;
  let total = 0;
  for (let guard = 0; guard < 20000 && cursor < finish; guard += 1) {
    const window = dayWindow(cursor, calendar);
    const minute = cursor.hour * 60 + cursor.minute;
    if (!window || minute >= window.end) {
      const next = nextOpening(cursor, calendar);
      if (next <= cursor) break;
      cursor = next;
      continue;
    }
    if (minute < window.start) {
      cursor = cursor.startOf("day").plus({ minutes: window.start });
      continue;
    }
    const finishMinute = cursor.toISODate() === finish.toISODate()
      ? Math.min(window.end, finish.hour * 60 + finish.minute)
      : window.end;
    if (finishMinute <= minute) break;
    total += finishMinute - minute;
    if (cursor.toISODate() === finish.toISODate()) break;
    const next = nextOpening(cursor, calendar);
    if (next <= cursor) break;
    cursor = next;
  }
  return total;
}

export function previousWorkingDay(due: DateTime, calendar: LabCalendar) {
  let day = due.setZone(calendar.zone).startOf("day").minus({ days: 1 });
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (dayWindow(day, calendar)) return day;
    day = day.minus({ days: 1 });
  }
  throw new Error("No previous working day");
}

export function laborMinutesByDate(start: DateTime, minutes: number, calendar: LabCalendar) {
  const totals = new Map<string, number>();
  if (minutes <= 0) return totals;
  let cursor = moveToWorkingStart(start, calendar);
  let remaining = minutes;
  for (let guard = 0; guard < 20000 && remaining > 0; guard += 1) {
    const window = dayWindow(cursor, calendar);
    if (!window) {
      cursor = nextOpening(cursor, calendar);
      continue;
    }
    const minute = cursor.hour * 60 + cursor.minute;
    const available = window.end - minute;
    const take = Math.min(available, remaining);
    const key = cursor.toISODate();
    if (!key) break;
    totals.set(key, (totals.get(key) ?? 0) + take);
    remaining -= take;
    if (remaining > 0) cursor = nextOpening(cursor, calendar);
  }
  return totals;
}
