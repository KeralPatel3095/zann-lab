import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { officeCode, parseTrackerWorkbook } from "../src/lib/sheet/tracker";

async function workbook() {
  const book = new ExcelJS.Workbook();
  const october = book.addWorksheet("October");
  october.addRow(["Case Number", "Patient Name", "Dental Office", "Pan Number", "Case Type", "Status", "Due Date", "Notes"]);
  october.addRow([new Date(Date.UTC(2026, 9, 1)), "", "", "", "", "", "", ""]);
  october.addRow([44001, "Ada Sample", "Harbourview Dental", "PAN-1", "Nightguard", "Delivered", new Date(Date.UTC(2026, 9, 3)), "Shade A2"]);
  october.addRow([44002, "Ben Sample", "Harbourview Dental", "PAN-2", "Crown", "In Lab", "Due date not mentioned", ""]);
    october.addRow([44002, "Ben Sample", "Harbourview Dental", "PAN-2", "Crown", "Packing", "Oct 6 by 12pm", "Rush note"]);
    october.addRow([44003, "Cara Sample", "Harbourview Dental", "PAN-3", "Nightguard", "Packing", "No due date mentioned / 28 Oct", ""]);
  const pickups = book.addWorksheet("October Pickups");
  pickups.addRow(["October 2nd"]);
  pickups.addRow(["Pickup slip 100"]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe("case tracker workbook", () => {
  it("keeps the latest row for a case and reads pickup lines", async () => {
    const parsed = await parseTrackerWorkbook(await workbook());
    expect(parsed.cases.map((row) => row.caseNumber)).toEqual(["44001", "44002", "44003"]);
    expect(parsed.cases[2].dueOn).toBe("2026-10-28");
    const delivered = parsed.cases[0];
    const open = parsed.cases[1];
    expect(delivered.receivedOn).toBe("2026-10-01");
    expect(delivered.dueOn).toBe("2026-10-03");
    expect(delivered.notes).toBe("Shade A2");
    expect(open.status).toBe("Packing");
    expect(open.dueOn).toBe("2026-10-06");
    expect(parsed.pickups).toHaveLength(1);
    expect(parsed.pickups[0].detail).toBe("Pickup slip 100");
    expect(parsed.pickups[0].pickupOn).toBe("2026-10-02");
    expect(officeCode("Harbourview Dental")).toBe(officeCode("harbourview dental"));
    expect(officeCode("Harbourview Dental")).not.toContain("harbourview");
  });
});
