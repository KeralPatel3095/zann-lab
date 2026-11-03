import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { operationalDueAt } from "../src/lib/office-rules";
import { belongsOnFinishToday, dueSheetLabel, LAB_ZONE, weekAheadWindow, workDayBeforeDue } from "../src/lib/scheduling/calendar";
import { officeCode } from "../src/lib/sheet/tracker";

describe("week ahead window", () => {
  it("on Wednesday lists Thursday, Friday, and Monday to Friday of next week", () => {
    const wednesday = DateTime.fromISO("2026-10-28", { zone: LAB_ZONE });
    const window = weekAheadWindow(wednesday);
    expect(window.start.toISODate()).toBe("2026-10-29");
    expect(window.end.toISODate()).toBe("2026-11-06");
    expect(window.start.weekday).toBe(4);
    expect(window.end.weekday).toBe(5);
  });

  it("places a 3 Nov due date on 2 Nov and keeps the sheet time", () => {
    const due = DateTime.fromISO("2026-11-03", { zone: LAB_ZONE });
    expect(workDayBeforeDue(due).toISODate()).toBe("2026-11-02");
    expect(dueSheetLabel("Nov 3 by 3pm", due.toJSDate())).toBe("Nov 3 by 3pm");
    expect(dueSheetLabel("2026-11-03", due.toJSDate())).toBe("3 Nov");
  });

  it("lists a 10am Tuesday due date on the Friday before", () => {
    const due = DateTime.fromISO("2026-11-10", { zone: LAB_ZONE });
    const earlier = DateTime.fromISO("2026-11-05", { zone: LAB_ZONE });
    expect(workDayBeforeDue(due, "Nov 10 by 10am").toISODate()).toBe("2026-11-06");
    expect(workDayBeforeDue(earlier, "Nov 5th before 9am").toISODate()).toBe("2026-11-03");
    expect(workDayBeforeDue(due).toISODate()).toBe("2026-11-09");
  });

  it("keeps the list on Monday to Friday", () => {
    const mondayDue = DateTime.fromISO("2026-11-02", { zone: LAB_ZONE });
    const sundayDue = DateTime.fromISO("2026-11-01", { zone: LAB_ZONE });
    expect(workDayBeforeDue(mondayDue).toISODate()).toBe("2026-10-30");
    expect(workDayBeforeDue(sundayDue).weekday).toBe(5);
    const friday = DateTime.fromISO("2026-10-30", { zone: LAB_ZONE });
    const window = weekAheadWindow(friday);
    expect(window.start.weekday).toBeLessThanOrEqual(5);
    expect(window.start.weekday).toBeGreaterThanOrEqual(1);
    expect(window.end.weekday).toBe(5);
  });
});

describe("finish today membership", () => {
  const monday = DateTime.fromISO("2026-11-02T12:00:00", { zone: LAB_ZONE });

  it("on 2 Nov includes dues through 3 Nov", () => {
    expect(
      belongsOnFinishToday({
        dueAt: "2026-11-02T16:30:00",
        trackerDue: "2 Nov",
        now: monday,
      }),
    ).toBe(true);
    expect(
      belongsOnFinishToday({
        dueAt: "2026-11-03T16:30:00",
        trackerDue: "3 Nov",
        now: monday,
      }),
    ).toBe(true);
  });

  it("on 2 Nov includes morning 4 Nov dues only", () => {
    expect(
      belongsOnFinishToday({
        dueAt: "2026-11-04T16:30:00",
        trackerDue: "Nov 4 by 9am",
        now: monday,
      }),
    ).toBe(true);
    expect(
      belongsOnFinishToday({
        dueAt: "2026-11-04T16:30:00",
        trackerDue: "Nov 4 by 3pm",
        now: monday,
      }),
    ).toBe(false);
  });

  it("does not include a case only because it was received today", () => {
    expect(
      belongsOnFinishToday({
        dueAt: "2026-11-20T16:30:00",
        sheetSectionAt: "2026-11-02T12:00:00",
        trackerDue: "Nov 20",
        now: monday,
      }),
    ).toBe(false);
  });

  it("includes a Nov 4 due on the work day before (3 Nov)", () => {
    expect(
      belongsOnFinishToday({
        dueAt: "2026-11-04T16:30:00",
        trackerDue: "Nov 4",
        now: DateTime.fromISO("2026-11-03T09:00:00", { zone: LAB_ZONE }),
      }),
    ).toBe(true);
  });

  it("keeps the sheet due label for a future due date", () => {
    expect(dueSheetLabel("Nov 4 by 3pm", "2026-11-04")).toBe("Nov 4 by 3pm");
  });

  it("lists early-finish offices on the weekday before send (due 3 Nov → send 2 Nov → 30 Oct)", () => {
    const code = officeCode("Monarch Dentistry - Morrison");
    const sheetDue = "2026-11-03T16:30:00";
    const opDue = operationalDueAt(sheetDue, code);
    expect(opDue?.toISODate()).toBe("2026-11-02");
    expect(workDayBeforeDue(opDue!, "3 Nov").toISODate()).toBe("2026-10-30");
    const friday = DateTime.fromISO("2026-10-30T09:00:00", { zone: LAB_ZONE });
    expect(
      belongsOnFinishToday({
        dueAt: sheetDue,
        trackerDue: "3 Nov",
        operationalDue: opDue,
        now: friday,
      }),
    ).toBe(true);
    const ahead = weekAheadWindow(friday);
    const workDay = workDayBeforeDue(opDue!, "3 Nov");
    expect(workDay >= ahead.start && workDay <= ahead.end).toBe(false);
    expect(dueSheetLabel("3 Nov", sheetDue)).toBe("3 Nov");
  });
});
