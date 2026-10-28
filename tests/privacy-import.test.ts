import { describe, expect, it } from "vitest";
import { classifyImportRow, suggestMapping } from "../src/lib/import/rows";
import { composeEmailNotification, composeTaskNotification } from "../src/lib/notifications/compose";
import { canViewClinicIdentity, caseViewForActor, exportColumnsFor, redactClinicIdentity, type ProductionCase } from "../src/lib/privacy";

const clinic = {
  dentistName: "Dr. Priya Raman",
  clinicName: "Northline Dental",
  email: "priya@northline.example",
  phone: "416-555-0148",
  billingNotes: "Account NET-30",
};

const record: ProductionCase = {
  id: "case-1",
  caseNumber: "ZN-10528",
  dentistCode: "DR-027",
  patientName: "Owen Bradley",
  panNumber: "PAN-2048",
  caseType: "crown_bridge",
  restorationType: "Zirconia crown",
  prescription: "Tooth 16, shade A2.",
  requiredRecords: "",
  specialHandling: "",
  receivedAt: null,
  productionReadyAt: null,
  requestedDeliveryAt: null,
  projectedCompletionAt: null,
  priority: "high",
  rush: false,
  overallStatus: "in_production",
  trackerStatus: "In Lab",
  dispatchStatus: "not_ready",
  deadlineIndicator: "on_track",
  scheduleFeasible: true,
  scheduleNote: "",
  holdReason: "",
  missingInformation: "",
  historical: false,
  currentDepartment: "CAD Design",
  currentStage: "CAD design",
};

describe("clinic identity", () => {
  it("hides clinic identity from technicians even when the flag is set", () => {
    expect(canViewClinicIdentity({ role: "technician", canViewClinicIdentity: true })).toBe(false);
    const view = caseViewForActor({ role: "technician", canViewClinicIdentity: true }, record, clinic);
    expect(view.clinic).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("Northline");
    expect(view.dentistCode).toBe("DR-027");
    expect(view.patientName).toBe("Owen Bradley");
  });

  it("shows clinic identity to the front desk and strips it from technician exports", () => {
    const desk = caseViewForActor({ role: "front_desk", canViewClinicIdentity: false }, record, clinic);
    expect(desk.clinic?.clinicName).toBe("Northline Dental");
    const columns = exportColumnsFor({ role: "technician", canViewClinicIdentity: false });
    expect(columns.join(",")).not.toMatch(/dentist_name|clinic_name|clinic_email|clinic_phone/);
    expect(exportColumnsFor({ role: "front_desk", canViewClinicIdentity: false })).toContain("clinic_name");
  });

  it("redacts clinic names from technician-facing text and email stays minimal", () => {
    expect(redactClinicIdentity(record.prescription, clinic)).not.toContain("Northline Dental");
    const email = composeEmailNotification("https://lab.example/tasks/1", null);
    expect(email.body).not.toContain("Owen");
    const notice = composeTaskNotification({
      dentistCode: "DR-027",
      patientName: "Owen Bradley",
      panNumber: "PAN-2048",
      caseNumber: "ZN-10528",
      caseType: "Zirconia Crown",
      department: "CAD Design",
      task: "Complete crown design",
      deadline: new Date("2026-11-04T19:00:00.000Z"),
      priority: "High",
      status: "Ready to Start",
      instructions: "Tooth 16",
      href: "https://lab.example/tasks/1",
    });
    expect(notice.title).toBe("Upcoming Production Task");
    expect(notice.body).toContain("Dentist Code: DR-027");
    expect(notice.body).not.toContain("Northline");
  });
});

describe("spreadsheet classification", () => {
  it("maps common laboratory headers and rejects invalid or duplicate rows", () => {
    const headers = ["Case No", "PAN", "Patient", "Dentist Code", "Due Date"];
    const mapping = suggestMapping(headers);
    expect(mapping["Case No"]).toBe("case_number");
    expect(mapping.PAN).toBe("pan_number");
    const invalid = classifyImportRow({ case_number: "ZN-1", patient_name: "A", dentist_code: "DR-1", requested_delivery_at: "not-a-date" }, new Set(), "skip_existing");
    expect(invalid.disposition).toBe("invalid");
    const duplicate = classifyImportRow({ case_number: "ZN-1", patient_name: "A", dentist_code: "DR-1" }, new Set(["zn-1"]), "skip_existing");
    expect(duplicate.disposition).toBe("duplicate");
    const update = classifyImportRow({ case_number: "ZN-1", patient_name: "A", dentist_code: "DR-1" }, new Set(["zn-1"]), "fill_blanks");
    expect(update.disposition).toBe("update");
  });
});
