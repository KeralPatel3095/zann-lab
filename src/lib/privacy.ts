export type StaffRole = "administrator" | "backend" | "front_desk" | "technician" | "department_lead" | "production_manager";

export type Actor = {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
  jobTitle: string;
  canViewClinicIdentity: boolean;
  active: boolean;
};

const clinicIdentityEmails = new Set([
  "keral.patel@zann-lab.test",
  "parneet.kaur@zann-lab.test",
  "ana.bogdanovic@zann-lab.test",
]);

/** Dentist office names are visible only to Keral, Parneet, and Ana. */
export function canViewClinicIdentity(actor: Pick<Actor, "email" | "role" | "canViewClinicIdentity">) {
  const email = (actor.email ?? "").trim().toLowerCase();
  return clinicIdentityEmails.has(email);
}

export type ProductionCase = {
  id: string;
  caseNumber: string;
  dentistCode: string;
  patientName: string;
  panNumber: string;
  caseType: string;
  restorationType: string;
  prescription: string;
  requiredRecords: string;
  specialHandling: string;
  receivedAt: string | null;
  productionReadyAt: string | null;
  requestedDeliveryAt: string | null;
  projectedCompletionAt: string | null;
  priority: string;
  rush: boolean;
  overallStatus: string;
  trackerStatus: string;
  dispatchStatus: string;
  deadlineIndicator: string;
  scheduleFeasible: boolean;
  scheduleNote: string;
  holdReason: string;
  missingInformation: string;
  historical: boolean;
  currentDepartment: string | null;
  currentStage: string | null;
};

export type ClinicIdentity = {
  dentistName: string;
  clinicName: string;
  email: string;
  phone: string;
  billingNotes: string;
};

const clinicKeys = ["dentistName", "clinicName", "email", "phone", "billingNotes", "clinicAccountId"] as const;

export function productionCaseView(record: ProductionCase) {
  return { ...record };
}

export function caseViewForActor(actor: Pick<Actor, "email" | "role" | "canViewClinicIdentity">, record: ProductionCase, clinic: ClinicIdentity | null) {
  const view: ProductionCase & { clinic?: ClinicIdentity } = productionCaseView(record);
  if (canViewClinicIdentity(actor) && clinic) view.clinic = clinic;
  for (const key of clinicKeys) {
    if (!canViewClinicIdentity(actor)) delete (view as Record<string, unknown>)[key];
  }
  return view;
}

export const technicianExportColumns = [
  "case_number",
  "dentist_code",
  "patient_name",
  "pan_number",
  "case_type",
  "received_at",
  "requested_delivery_at",
  "current_department",
  "current_stage",
  "overall_status",
  "projected_completion",
  "deadline_indicator",
  "dispatch_status",
  "priority",
] as const;

export const clinicExportColumns = ["dentist_name", "clinic_name", "clinic_email", "clinic_phone"] as const;

export function exportColumnsFor(actor: Pick<Actor, "email" | "role" | "canViewClinicIdentity">) {
  if (!canViewClinicIdentity(actor)) return [...technicianExportColumns];
  return [...technicianExportColumns, ...clinicExportColumns];
}

export function redactClinicIdentity(text: string, clinic: ClinicIdentity | null) {
  if (!clinic || !text) return text;
  let output = text;
  for (const value of [clinic.email, clinic.phone, clinic.billingNotes, clinic.clinicName, clinic.dentistName]) {
    const token = value.trim();
    if (token.length < 4) continue;
    output = output.split(token).join("[restricted]");
  }
  return output;
}
