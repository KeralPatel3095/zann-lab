import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { dueSheetLabel, LAB_ZONE, weekAheadWindow, workDayBeforeDue } from "../src/lib/scheduling/calendar";

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
