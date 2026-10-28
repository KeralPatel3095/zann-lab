import { DateTime } from "luxon";
import { previousWorkingDay, workingMinutesBetween, type LabCalendar } from "./calendar";

export type DeadlineIndicator = "on_track" | "due_soon" | "at_risk" | "overdue";

export function assessDeadline(input: {
  now: DateTime;
  requestedDelivery: DateTime | null;
  projectedFinish: DateTime | null;
  feasible: boolean;
  remainingWorkMinutes: number;
  nextLaborDue: DateTime | null;
  calendar: LabCalendar;
  terminal: boolean;
}): DeadlineIndicator {
  if (input.terminal) return "on_track";
  const now = input.now.setZone(input.calendar.zone);
  if (input.requestedDelivery && now > input.requestedDelivery.setZone(input.calendar.zone)) return "overdue";
  if (!input.feasible) return "at_risk";
  if (input.requestedDelivery && input.projectedFinish && input.projectedFinish > input.requestedDelivery) return "at_risk";
  if (input.requestedDelivery) {
    const available = workingMinutesBetween(now, input.requestedDelivery, input.calendar);
    if (input.remainingWorkMinutes > available) return "at_risk";
  }
  if (input.nextLaborDue) {
    const due = input.nextLaborDue.setZone(input.calendar.zone);
    const today = now.toISODate();
    const dueDay = due.toISODate();
    const previous = previousWorkingDay(due, input.calendar).toISODate();
    if (due <= now) return "at_risk";
    if (dueDay === today || previous === today) return "due_soon";
  }
  return "on_track";
}

export function reminderIsDue(laborDue: DateTime, now: DateTime, calendar: LabCalendar, reminderTime: string) {
  const [hourText, minuteText] = reminderTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  const remindDay = previousWorkingDay(laborDue, calendar);
  const localNow = now.setZone(calendar.zone);
  if (localNow.toISODate() !== remindDay.toISODate()) return false;
  const threshold = localNow.startOf("day").set({ hour, minute, second: 0, millisecond: 0 });
  return localNow >= threshold;
}

export function reminderKey(taskId: string, laborDue: DateTime) {
  return `reminder:${taskId}:${laborDue.toUTC().toISO()}`;
}

export function overdueKey(taskId: string, laborDue: DateTime) {
  return `overdue:${taskId}:${laborDue.toUTC().toISO()}`;
}

export function summaryKey(userId: string, day: string) {
  return `summary:${userId}:${day}`;
}
