import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { addWorkingMinutes, subtractWorkingMinutes, workingMinutesBetween, type LabCalendar } from "../src/lib/scheduling/calendar";
import { assignTechnicians, scheduleBackward, scheduleForward } from "../src/lib/scheduling/engine";
import { assessDeadline, reminderIsDue } from "../src/lib/scheduling/risk";

const calendar: LabCalendar = {
  zone: "America/Toronto",
  hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 16 * 60 })),
  overrides: [{ date: "2026-10-30", isWorkingDay: false }],
};

describe("working calendar", () => {
  it("moves a Monday morning deadline back across the weekend", () => {
    const end = DateTime.fromISO("2026-11-02T09:00", { zone: "America/Toronto" });
    const start = subtractWorkingMinutes(end, 120, calendar);
    expect(start.toISO()).toBe(DateTime.fromISO("2026-10-29T15:00", { zone: "America/Toronto" }).toISO());
  });

  it("skips a configured holiday", () => {
    const end = DateTime.fromISO("2026-11-02T09:00", { zone: "America/Toronto" });
    const withHoliday = subtractWorkingMinutes(end, 120, calendar);
    expect(withHoliday.weekday).toBe(4);
  });

  it("keeps elapsed processing on the clock across the spring time change", () => {
    const start = DateTime.fromISO("2026-03-08T01:30", { zone: "America/Toronto" });
    const finish = start.plus({ minutes: 120 });
    expect(finish.toUTC().toMillis() - start.toUTC().toMillis()).toBe(120 * 60 * 1000);
    expect(finish.toFormat("HH:mm")).toBe("04:30");
  });

  it("does not double-count the fall-back hour for working time", () => {
    const end = DateTime.fromISO("2026-11-02T09:00", { zone: "America/Toronto" });
    const start = subtractWorkingMinutes(end, 90, calendar);
    expect(workingMinutesBetween(start, end, calendar)).toBe(90);
  });

  it("adds working minutes only inside business hours", () => {
    const start = DateTime.fromISO("2026-10-29T15:30", { zone: "America/Toronto" });
    const finish = addWorkingMinutes(start, 90, calendar);
    expect(finish.weekday).toBe(1);
    expect(finish.toFormat("HH:mm")).toBe("09:00");
  });
});

describe("production schedule", () => {
  const stages = [
    { id: "a", name: "Design", workMinutes: 60, elapsedMinutes: 0, departmentId: "cad", predecessors: [] },
    { id: "b", name: "Finish", workMinutes: 60, elapsedMinutes: 0, departmentId: "finish", predecessors: ["a"] },
  ];

  it("flags a delivery that cannot fit the remaining stages", () => {
    const delivery = DateTime.fromISO("2026-11-02T09:00", { zone: "America/Toronto" });
    const ready = DateTime.fromISO("2026-11-02T08:30", { zone: "America/Toronto" });
    const result = scheduleBackward(stages, delivery, ready, calendar, 0);
    expect(result.feasible).toBe(false);
    expect(result.reasons.join(" ")).toContain("Design");
  });

  it("does not call a case on track only because the final deadline is in the future", () => {
    const now = DateTime.fromISO("2026-11-02T08:00", { zone: "America/Toronto" });
    const delivery = now.plus({ hours: 2 });
    const indicator = assessDeadline({
      now,
      requestedDelivery: delivery,
      projectedFinish: delivery.plus({ days: 1 }),
      feasible: false,
      remainingWorkMinutes: 400,
      nextLaborDue: delivery,
      calendar,
      terminal: false,
    });
    expect(indicator).not.toBe("on_track");
  });

  it("schedules parallel stages from the same predecessor", () => {
    const parallel = [
      { id: "a", name: "Intake", workMinutes: 30, elapsedMinutes: 0, departmentId: "lab", predecessors: [] },
      { id: "b", name: "Scan", workMinutes: 30, elapsedMinutes: 0, departmentId: "lab", predecessors: ["a"] },
      { id: "c", name: "Model", workMinutes: 30, elapsedMinutes: 0, departmentId: "lab", predecessors: ["a"] },
    ];
    const result = scheduleForward(parallel, DateTime.fromISO("2026-11-02T08:00", { zone: "America/Toronto" }), calendar);
    const scan = result.stages.find((stage) => stage.id === "b");
    const model = result.stages.find((stage) => stage.id === "c");
    expect(scan?.plannedStart.toMillis()).toBe(model?.plannedStart.toMillis());
  });

  it("does not assign overlapping work to the same technician", () => {
    const start = DateTime.fromISO("2026-11-02T09:00", { zone: "America/Toronto" });
    const result = assignTechnicians(
      [
        { id: "one", name: "Crown", departmentId: "cad", plannedStart: start, laborDue: start.plus({ hours: 2 }), workMinutes: 120 },
        { id: "two", name: "Bridge", departmentId: "cad", plannedStart: start.plus({ hours: 1 }), laborDue: start.plus({ hours: 3 }), workMinutes: 120 },
      ],
      [{ id: "tech", departmentIds: ["cad"], capacityMinutes: 420, commitments: [] }],
      calendar,
    );
    expect(result.assignments.one).toBe("tech");
    expect(result.assignments.two).toBeNull();
    expect(result.conflicts.length).toBe(1);
  });
});

describe("reminders", () => {
  it("is due on the previous working day, not the calendar day before a Monday deadline", () => {
    const due = DateTime.fromISO("2026-11-02T15:00", { zone: "America/Toronto" });
    const friday = DateTime.fromISO("2026-10-30T08:00", { zone: "America/Toronto" });
    const thursday = DateTime.fromISO("2026-10-29T08:00", { zone: "America/Toronto" });
    expect(reminderIsDue(due, friday, calendar, "08:00")).toBe(false);
    expect(reminderIsDue(due, thursday, calendar, "08:00")).toBe(true);
  });
});
