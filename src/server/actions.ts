"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/current";
import { verifyLocalLogin } from "@/lib/auth/login";
import { signSession } from "@/lib/auth/session";
import { changeOwnPassword, createStaff, saveDepartment, saveHoliday, setStaffActive, setStaffPassword, updateSetting, updateStage } from "@/lib/domain/admin";
import { changeDeliveryDate, createCase, holdCase, recordDispatch, recordMissingInformation, releaseCase, resumeCase, type CaseInput } from "@/lib/domain/cases";
import { assignTask, recordQuality, transitionTask } from "@/lib/domain/tasks";
import { commitImport } from "@/lib/domain/transfer";
import { applyTrackerWorkbook, saveTrackerSheetUrl, syncConfiguredTracker } from "@/lib/domain/tracker-sync";
import { parseTrackerWorkbook } from "@/lib/sheet/tracker";
import { markNotificationRead } from "@/lib/domain/reports";
import type { ImportField } from "@/lib/import/rows";
import { importFields } from "@/lib/import/rows";
import type { StaffRole } from "@/lib/privacy";

export async function loginAction(_state: { error: string }, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const user = await verifyLocalLogin(email, password);
  if (!user) return { error: "Those credentials were not recognized." };
  const jar = await cookies();
  jar.set("zann_session", await signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect("/");
}

export async function logoutAction() {
  const jar = await cookies();
  jar.delete("zann_session");
  redirect("/login");
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function caseInput(formData: FormData): CaseInput {
  const toothNumbers = formData.getAll("tooth_number").map(String);
  const count = Math.max(toothNumbers.length, 1);
  const units = Array.from({ length: count }, (_, index) => ({
    toothNumber: String(formData.getAll("tooth_number")[index] ?? ""),
    unitIdentifier: String(formData.getAll("unit_identifier")[index] ?? ""),
    material: String(formData.getAll("material")[index] ?? ""),
    shade: String(formData.getAll("shade")[index] ?? ""),
    instructions: String(formData.getAll("unit_instructions")[index] ?? ""),
  }));
  return {
    dentistCode: text(formData, "dentist_code"),
    patientName: text(formData, "patient_name"),
    panNumber: text(formData, "pan_number"),
    workflowTemplateId: text(formData, "workflow_template_id"),
    restorationType: text(formData, "restoration_type"),
    prescription: text(formData, "prescription"),
    requiredRecords: text(formData, "required_records"),
    specialHandling: text(formData, "special_handling"),
    receivedAt: text(formData, "received_at"),
    requestedDeliveryAt: text(formData, "requested_delivery_at"),
    priority: (text(formData, "priority") || "normal") as CaseInput["priority"],
    rush: formData.get("rush") === "on",
    hold: formData.get("intent") === "hold",
    holdReason: text(formData, "hold_reason"),
    excludedStageIds: formData.getAll("exclude_stage").map(String),
    units,
    clinic: {
      dentistName: text(formData, "dentist_name"),
      clinicName: text(formData, "clinic_name"),
      email: text(formData, "clinic_email"),
      phone: text(formData, "clinic_phone"),
      billingNotes: text(formData, "billing_notes"),
    },
  };
}

async function actorId() {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  return actor.id;
}

export async function createCaseAction(_state: { error: string; reasons?: string[] }, formData: FormData) {
  const id = await actorId();
  const created = await createCase(id, caseInput(formData));
  if (!created.ok) return { error: created.message, reasons: created.reasons ?? [] };
  if (formData.get("intent") === "release") {
    const released = await releaseCase(id, created.id, formData.get("acknowledge") === "on");
    if (!released.ok) {
      redirect(`/cases/${created.id}?notice=${encodeURIComponent([released.message, ...(released.reasons ?? [])].join(" "))}`);
    }
  }
  redirect(`/cases/${created.id}`);
}

export async function releaseCaseAction(formData: FormData) {
  const id = await actorId();
  const result = await releaseCase(id, text(formData, "case_id"), formData.get("acknowledge") === "on");
  if (!result.ok) redirect(`/cases/${text(formData, "case_id")}?notice=${encodeURIComponent(result.message)}`);
  redirect(`/cases/${text(formData, "case_id")}`);
}

export async function holdCaseAction(formData: FormData) {
  const id = await actorId();
  await holdCase(id, text(formData, "case_id"), text(formData, "reason"));
  redirect(`/cases/${text(formData, "case_id")}`);
}

export async function resumeCaseAction(formData: FormData) {
  const id = await actorId();
  await resumeCase(id, text(formData, "case_id"));
  redirect(`/cases/${text(formData, "case_id")}`);
}

export async function deliveryAction(formData: FormData) {
  const id = await actorId();
  await changeDeliveryDate(id, text(formData, "case_id"), text(formData, "requested_delivery_at"));
  redirect(`/cases/${text(formData, "case_id")}`);
}

export async function missingInfoAction(formData: FormData) {
  const id = await actorId();
  await recordMissingInformation(id, text(formData, "case_id"), text(formData, "note"));
  redirect(`/cases/${text(formData, "case_id")}`);
}

export async function dispatchAction(formData: FormData) {
  const id = await actorId();
  const caseId = text(formData, "case_id");
  const result = await recordDispatch(id, caseId, {
    courier: text(formData, "courier"),
    trackingNumber: text(formData, "tracking_number"),
    notes: text(formData, "notes"),
    deliver: formData.get("intent") === "deliver",
  });
  redirect(`/cases/${caseId}?notice=${encodeURIComponent(result.ok ? "Dispatch recorded." : result.message)}`);
}

export async function taskAction(formData: FormData) {
  const id = await actorId();
  const taskId = text(formData, "task_id");
  const action = text(formData, "action") as "start" | "pause" | "resume" | "block" | "resolve" | "complete" | "approve" | "clarify";
  const result = await transitionTask(id, taskId, action, {
    reason: text(formData, "reason"),
    category: text(formData, "category"),
    checkedIds: formData.getAll("checked").map(String),
    version: Number(text(formData, "version")),
  });
  redirect(`/tasks/${taskId}?notice=${encodeURIComponent(result.ok ? "Task updated." : result.message)}`);
}

export async function qualityAction(formData: FormData) {
  const id = await actorId();
  const taskId = text(formData, "task_id");
  const labels = formData.getAll("qc_label").map(String);
  const passed = new Set(formData.getAll("qc_passed").map(String));
  const result = await recordQuality(id, taskId, {
    outcome: text(formData, "outcome") as "approved" | "rejected" | "rework",
    notes: text(formData, "notes"),
    failedTaskId: text(formData, "failed_task_id") || undefined,
    version: Number(text(formData, "version")),
    results: labels.map((label) => ({ label, passed: passed.has(label) })),
  });
  redirect(`/tasks/${taskId}?notice=${encodeURIComponent(result.ok ? "Quality result recorded." : result.message)}`);
}

export async function assignAction(formData: FormData) {
  const id = await actorId();
  await assignTask(id, text(formData, "task_id"), text(formData, "assignee_id"), Number(text(formData, "version")));
  redirect("/department");
}

export async function syncTrackerAction(formData: FormData) {
  const id = await actorId();
  const saved = await saveTrackerSheetUrl(id, text(formData, "sheet_url"));
  if (!saved.ok) redirect(`/import?notice=${encodeURIComponent(saved.message)}`);
  if (!text(formData, "sheet_url").trim()) redirect("/import?notice=Automatic%20sheet%20updates%20are%20off.");
  await syncConfiguredTracker();
  redirect("/import");
}

export async function importAction(_state: { message: string }, formData: FormData) {
  const id = await actorId();
  const file = formData.get("file");
  if (!(file instanceof File)) return { message: "Choose a spreadsheet." };
  const bytes = Buffer.from(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    const tracker = await parseTrackerWorkbook(bytes);
    if (tracker.cases.length) {
      const result = await applyTrackerWorkbook(id, bytes);
      return { message: result.ok ? result.message : result.message };
    }
  }
  const mapping: Record<string, ImportField | ""> = {};
  for (const field of importFields) {
    const header = text(formData, `map_${field}`);
    if (header) mapping[header] = field;
  }
  const result = await commitImport(
    id,
    file.name,
    bytes,
    mapping,
    text(formData, "mode") === "fill_blanks" ? "fill_blanks" : "skip_existing",
    formData.get("historical") === "on",
  );
  if (!result.ok) return { message: result.message };
  return { message: `Created ${result.created}, updated blanks ${result.updated}, duplicates ${result.duplicates}, invalid ${result.invalid}.` };
}

export async function staffAction(formData: FormData) {
  const id = await actorId();
  const result = await createStaff(id, {
    fullName: text(formData, "full_name"),
    email: text(formData, "email"),
    role: text(formData, "role") as StaffRole,
    password: text(formData, "password"),
    departmentId: text(formData, "department_id") || undefined,
    canViewClinicIdentity: formData.get("clinic") === "on",
  });
  redirect(`/admin?notice=${encodeURIComponent(result.ok ? "Account created." : result.message)}`);
}

export async function staffPasswordAction(formData: FormData) {
  const id = await actorId();
  const result = await setStaffPassword(id, text(formData, "user_id"), text(formData, "password").trim());
  redirect(`/admin?notice=${encodeURIComponent(result.ok ? "Password saved for that account." : result.message)}`);
}

export async function ownPasswordAction(formData: FormData) {
  const id = await actorId();
  const next = text(formData, "next_password").trim();
  const confirm = text(formData, "confirm_password").trim();
  if (next !== confirm) redirect("/account?notice=The%20new%20password%20and%20confirmation%20do%20not%20match.");
  const result = await changeOwnPassword(id, text(formData, "current_password").trim(), next);
  redirect(`/account?notice=${encodeURIComponent(result.ok ? "Your password is updated. Use it the next time you sign in." : result.message)}`);
}

export async function staffActiveAction(formData: FormData) {
  const id = await actorId();
  await setStaffActive(id, text(formData, "user_id"), formData.get("active") === "true");
  redirect("/admin");
}

export async function stageAction(formData: FormData) {
  const id = await actorId();
  await updateStage(id, text(formData, "stage_id"), {
    workMinutes: Number(text(formData, "work_minutes")),
    elapsedMinutes: Number(text(formData, "elapsed_minutes")),
    skippable: formData.get("skippable") === "on",
    active: formData.get("active") === "on",
  });
  redirect("/admin");
}

export async function settingAction(formData: FormData) {
  const id = await actorId();
  await updateSetting(id, text(formData, "key"), text(formData, "value"));
  redirect("/admin");
}

export async function holidayAction(formData: FormData) {
  const id = await actorId();
  await saveHoliday(id, text(formData, "date"), formData.get("working") === "on", text(formData, "description"));
  redirect("/admin");
}

export async function departmentAction(formData: FormData) {
  const id = await actorId();
  await saveDepartment(id, { name: text(formData, "name"), description: text(formData, "description"), active: formData.get("active") === "on" });
  redirect("/admin");
}

export async function readNotificationAction(formData: FormData) {
  const id = await actorId();
  await markNotificationRead(id, text(formData, "notification_id"));
  redirect("/notifications");
}
