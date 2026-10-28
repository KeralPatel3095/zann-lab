import { DateTime } from "luxon";
import { LAB_ZONE } from "../scheduling/calendar";

export type TaskNotice = {
  dentistCode: string;
  patientName: string;
  panNumber: string;
  caseNumber: string;
  caseType: string;
  department: string;
  task: string;
  deadline: Date;
  priority: string;
  status: string;
  instructions: string;
  href: string;
};

const forbidden = ["dentistName", "clinicName", "clinicEmail", "phone", "billingNotes", "billing"] as const;

export function formatOperationalDeadline(deadline: Date, now = new Date(), zone = LAB_ZONE) {
  const due = DateTime.fromJSDate(deadline).setZone(zone);
  const current = DateTime.fromJSDate(now).setZone(zone);
  const time = due.toFormat("t");
  if (due.toISODate() === current.plus({ days: 1 }).toISODate()) return `Tomorrow, ${time}`;
  if (due.toISODate() === current.toISODate()) return `Today, ${time}`;
  return due.toFormat("ccc, d LLL yyyy, t");
}

export function composeTaskNotification(notice: TaskNotice, now = new Date(), title = "Upcoming Production Task") {
  const unexpected = forbidden.filter((key) => key in (notice as object));
  if (unexpected.length > 0) {
    throw new Error("Notification payload contains restricted fields");
  }
  const body = [
    `Dentist Code: ${notice.dentistCode}`,
    `Patient Name: ${notice.patientName}`,
    `PAN Number: ${notice.panNumber}`,
    `Case Number: ${notice.caseNumber}`,
    `Case Type: ${notice.caseType}`,
    `Department: ${notice.department}`,
    `Task: ${notice.task}`,
    `Deadline: ${formatOperationalDeadline(notice.deadline, now)}`,
    `Priority: ${notice.priority}`,
    `Status: ${notice.status}`,
    `Instructions: ${notice.instructions || "None recorded"}`,
    notice.href,
  ].join("\n");
  return { title, body };
}

export function composeEmailNotification(href: string, includeOperationalDetail: string | null) {
  const title = "Upcoming Production Task";
  const body = includeOperationalDetail
    ? includeOperationalDetail
    : `You have a production task in the laboratory system. Sign in to view it:\n${href}`;
  return { title, body };
}
