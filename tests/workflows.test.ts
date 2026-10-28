import { DateTime } from "luxon";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/lib/auth/password";
import { getSql, withUser } from "../src/lib/db/sql";
import { changeDeliveryDate, createCase, getCase, recordDispatch, releaseCase, type CaseInput } from "../src/lib/domain/cases";
import { runReminderJob } from "../src/lib/domain/jobs";
import { auditLog, listNotifications } from "../src/lib/domain/reports";
import { getTask, listMyTasks, recordQuality, transitionTask } from "../src/lib/domain/tasks";
import { commitImport, exportCases } from "../src/lib/domain/transfer";
import { LAB_ZONE } from "../src/lib/scheduling/calendar";

let desk = "";
let tech = "";
let otherTech = "";
let lead = "";
let manager = "";
let admin = "";
let otherTemplate = "";
let crownTemplate = "";
const clinicName = "Northline Dental";
const dentistName = "Dr. Priya Raman";

async function insertUser(email: string, role: string, clinic: boolean) {
  const sql = await getSql();
  const [existing] = await sql<{ id: string }[]>`select id from profiles where lower(email) = lower(${email})`;
  if (existing) return existing.id;
  const [row] = await sql<{ id: string }[]>`
    insert into profiles (full_name, email, role, can_view_clinic_identity)
    values (${email.split("@")[0]}, ${email}, ${role}::app_role, ${clinic})
    returning id
  `;
  await sql`insert into local_credentials (user_id, password_hash) values (${row.id}, ${await hashPassword("Test-Password-1")})`;
  return row.id;
}

async function member(userId: string, departmentName: string, membership: "member" | "lead") {
  const sql = await getSql();
  const [department] = await sql<{ id: string }[]>`select id from departments where name = ${departmentName}`;
  await sql`
    insert into department_members (department_id, user_id, membership_role)
    values (${department.id}, ${userId}, ${membership}::membership_role)
    on conflict do nothing
  `;
}

function input(templateId: string, overrides: Partial<CaseInput> = {}): CaseInput {
  const received = DateTime.now().setZone(LAB_ZONE).minus({ hours: 1 }).toISO() ?? "";
  const delivery = DateTime.now().setZone(LAB_ZONE).plus({ days: 21 }).toISO() ?? "";
  return {
    dentistCode: "DR-027",
    patientName: "Owen Bradley",
    panNumber: "PAN-2048",
    workflowTemplateId: templateId,
    restorationType: "Zirconia crown",
    prescription: "Tooth 16, shade A2.",
    requiredRecords: "Scan",
    specialHandling: "",
    receivedAt: received,
    requestedDeliveryAt: delivery,
    priority: "normal",
    rush: false,
    hold: false,
    holdReason: "",
    excludedStageIds: [],
    units: [{ toothNumber: "16", unitIdentifier: "1", material: "Zirconia", shade: "A2", instructions: "" }],
    clinic: { dentistName, clinicName, email: "priya@northline.example", phone: "416-555-0148", billingNotes: "Account NET-30" },
    ...overrides,
  };
}

beforeAll(async () => {
  desk = await insertUser("desk.workflow@zann-lab.test", "front_desk", false);
  tech = await insertUser("tech.workflow@zann-lab.test", "technician", false);
  otherTech = await insertUser("other.workflow@zann-lab.test", "technician", false);
  lead = await insertUser("lead.workflow@zann-lab.test", "department_lead", false);
  manager = await insertUser("manager.workflow@zann-lab.test", "production_manager", false);
  admin = await insertUser("admin.workflow@zann-lab.test", "administrator", true);
  for (const name of ["Other Laboratory Services", "Finishing and Quality Control", "Crowns and Bridges", "Digital Design and CAD/CAM"]) {
    await member(tech, name, "member");
  }
  await member(lead, "Other Laboratory Services", "lead");
  const sql = await getSql();
  await sql`delete from job_locks`;
  await sql`update production_tasks set task_status = 'cancelled' where task_status not in ('completed', 'cancelled')`;
  const templates = await sql<{ id: string; case_type: string }[]>`select id, case_type from workflow_templates`;
  otherTemplate = templates.find((item) => item.case_type === "other")?.id ?? "";
  crownTemplate = templates.find((item) => item.case_type === "crown_bridge")?.id ?? "";
});

describe("laboratory workflows", () => {
  it("rejects an incomplete case and a duplicate case number", async () => {
    const draft = await createCase(desk, input(otherTemplate, { panNumber: "", caseNumber: `ZN-DRAFT-${Date.now()}` }));
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const saved = await getCase(desk, draft.id);
    expect(saved?.case.overallStatus).toBe("draft");
    const released = await releaseCase(desk, draft.id, true);
    expect(released.ok).toBe(false);
    const tasks = await withUser(desk, async (tx) => tx<{ id: string }[]>`select id from production_tasks where case_id = ${draft.id}`);
    expect(tasks).toHaveLength(0);

    const number = `ZN-DUP-${Date.now()}`;
    const first = await createCase(desk, input(otherTemplate, { caseNumber: number }));
    const second = await createCase(desk, input(otherTemplate, { caseNumber: number, panNumber: "PAN-9999" }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.message).toContain("already exists");
  });

  it("generates tasks, keeps clinic identity from technicians, and holds downstream work", async () => {
    const created = await createCase(desk, input(otherTemplate, { caseNumber: `ZN-FLOW-${Date.now()}`, panNumber: `PAN-${Date.now()}`, requestedDeliveryAt: DateTime.now().setZone(LAB_ZONE).plus({ days: 24 }).toISO() ?? "" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const released = await releaseCase(desk, created.id, false);
    expect(released.ok, JSON.stringify(released)).toBe(true);
    const detail = await getCase(desk, created.id);
    expect(detail?.tasks.length).toBeGreaterThan(2);
    expect(detail?.case.clinic?.clinicName).toBe(clinicName);
    const first = detail?.tasks[0];
    const second = detail?.tasks[1];
    expect(first?.task_status).toBe("ready_to_start");
    expect(second?.task_status).toBe("waiting");

    expect(first?.assigned_user_id, detail?.case.scheduleNote).toBe(tech);
    const visible = await getTask(tech, first?.id ?? "");
    expect(visible?.case?.patient_name).toBe("Owen Bradley");
    expect(visible?.clinic).toBeNull();
    expect(JSON.stringify(visible)).not.toContain(clinicName);
    expect(JSON.stringify(visible)).not.toContain("priya@northline.example");
    expect(await getTask(otherTech, first?.id ?? "")).toBeNull();

    const clinics = await withUser(tech, async (tx) => tx<{ clinic_name: string }[]>`select clinic_name from clinic_accounts`);
    expect(clinics).toEqual([]);
    const links = await withUser(tech, async (tx) => tx<{ case_id: string }[]>`select case_id from case_clinic_links`);
    expect(links).toEqual([]);

    const file = await exportCases(tech, "csv");
    const csv = file.buffer.toString("utf8");
    expect(csv).not.toContain(clinicName);
    expect(csv).not.toContain("priya@northline.example");
    expect(csv).not.toContain(dentistName);
    const deskFile = await exportCases(desk, "csv");
    expect(deskFile.buffer.toString("utf8")).toContain(clinicName);

    const started = await transitionTask(tech, first?.id ?? "", "start", { version: first?.version ?? 1 });
    expect(started.ok).toBe(true);
    const blocked = await transitionTask(tech, first?.id ?? "", "block", { version: (first?.version ?? 1) + 1, category: "missing_prescription", reason: "Prescription tooth is unreadable" });
    expect(blocked.ok).toBe(true);
    const notes = await listNotifications(desk);
    expect(notes.some((note) => note.title.includes("blocked"))).toBe(true);
    expect(notes.map((note) => note.body).join("\n")).not.toContain(clinicName);
    const blockedTask = await getTask(tech, first?.id ?? "");
    const resolved = await transitionTask(tech, first?.id ?? "", "resolve", { version: blockedTask?.task.version ?? 1 });
    expect(resolved.ok, JSON.stringify(resolved)).toBe(true);

    const current = await getTask(tech, first?.id ?? "");
    const checked = current?.checklist.filter((item) => item.required).map((item) => item.id) ?? [];
    const done = await transitionTask(tech, first?.id ?? "", "complete", { version: current?.task.version ?? 1, checkedIds: checked });
    expect(done.ok).toBe(true);
    const next = await getTask(tech, second?.id ?? "");
    expect(next?.task.task_status).toBe("ready_to_start");

    const denied = await changeDeliveryDate(tech, created.id, DateTime.now().setZone(LAB_ZONE).plus({ days: 30 }).toISO() ?? "");
    expect(denied.ok).toBe(false);
    const secondId = second?.id ?? "";
    await expect(withUser(tech, async (tx) => {
      await tx`update production_tasks set labor_due_at = now() where id = ${secondId}`;
    })).rejects.toThrow(/deadlines|Not allowed/i);

    const audit = await auditLog(admin);
    expect(audit.some((event) => event.entity_type === "cases")).toBe(true);
    const early = await recordDispatch(desk, created.id, { courier: "Local", trackingNumber: "T1", notes: "" });
    expect(early.ok).toBe(false);
    const after = await getCase(desk, created.id);
    expect(after?.case.overallStatus).not.toBe("dispatched");
    await expect(withUser(desk, async (tx) => {
      await tx`update cases set overall_status = 'dispatched' where id = ${created.id}`;
    })).rejects.toThrow(/dispatched/i);
  });

  it("flags an infeasible delivery and creates crown workflow tasks", async () => {
    const soon = await createCase(desk, input(otherTemplate, {
      caseNumber: `ZN-SOON-${Date.now()}`,
      panNumber: `PAN-SOON-${Date.now()}`,
      requestedDeliveryAt: DateTime.now().setZone(LAB_ZONE).plus({ hours: 2 }).toISO() ?? "",
    }));
    expect(soon.ok).toBe(true);
    if (!soon.ok) return;
    const refused = await releaseCase(desk, soon.id, false);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toMatch(/does not fit/i);
    const none = await withUser(desk, async (tx) => tx<{ id: string }[]>`select id from production_tasks where case_id = ${soon.id}`);
    expect(none).toHaveLength(0);

    const crown = await createCase(desk, input(crownTemplate, { caseNumber: `ZN-CROWN-${Date.now()}`, panNumber: `PAN-CROWN-${Date.now()}`, requestedDeliveryAt: DateTime.now().setZone(LAB_ZONE).plus({ days: 40 }).toISO() ?? "" }));
    expect(crown.ok).toBe(true);
    if (!crown.ok) return;
    const released = await releaseCase(desk, crown.id, true);
    expect(released.ok).toBe(true);
    const detail = await getCase(desk, crown.id);
    const sql = await getSql();
    const stages = await sql<{ id: string }[]>`select id from workflow_stages where workflow_template_id = ${crownTemplate} and active`;
    expect(detail?.tasks).toHaveLength(stages.length);
  });

  it("returns a failed quality check to rework instead of completing the case", async () => {
    const created = await createCase(desk, input(otherTemplate, { caseNumber: `ZN-QC-${Date.now()}`, panNumber: `PAN-QC-${Date.now()}`, requestedDeliveryAt: DateTime.now().setZone(LAB_ZONE).plus({ days: 18 }).toISO() ?? "" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await releaseCase(desk, created.id, true)).ok).toBe(true);
    for (let guard = 0; guard < 6; guard += 1) {
      const open = (await getCase(desk, created.id))?.tasks.find((task) => task.task_status === "ready_to_start" && !task.is_quality_gate && !task.is_dispatch_stage);
      if (!open) break;
      const started = await transitionTask(tech, open.id, "start", { version: open.version });
      expect(started.ok, JSON.stringify(started)).toBe(true);
      const current = await getTask(tech, open.id);
      const checked = current?.checklist.filter((item) => item.required).map((item) => item.id) ?? [];
      const done = await transitionTask(tech, open.id, "complete", { version: current?.task.version ?? open.version + 1, checkedIds: checked });
      expect(done.ok, JSON.stringify(done)).toBe(true);
    }
    const qc = (await getCase(desk, created.id))?.tasks.find((task) => task.is_quality_gate);
    expect(qc?.task_status).toBe("ready_to_start");
    const result = await recordQuality(tech, qc?.id ?? "", {
      outcome: "rework",
      notes: "Contact is open on the mesial.",
      version: qc?.version ?? 1,
      results: [{ label: "Applicable fit and contact checks completed", passed: false }],
    });
    expect(result.ok).toBe(true);
    const after = await getCase(desk, created.id);
    expect(after?.case.overallStatus).toBe("rework_required");
    expect(after?.tasks.some((task) => task.title.startsWith("Rework:"))).toBe(true);
    expect(after?.case.overallStatus).not.toBe("dispatched");
  });

  it("sends one reminder on the previous working day and ignores a repeated job", async () => {
    const created = await createCase(desk, input(otherTemplate, { caseNumber: `ZN-REM-${Date.now()}`, panNumber: `PAN-REM-${Date.now()}`, requestedDeliveryAt: DateTime.now().setZone(LAB_ZONE).plus({ days: 55 }).toISO() ?? "" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await releaseCase(desk, created.id, true)).ok).toBe(true);
    const task = (await getCase(desk, created.id))?.tasks.find((item) => item.assigned_user_id === tech);
    expect(task).toBeTruthy();
    const due = DateTime.fromISO("2026-11-04T15:00", { zone: LAB_ZONE });
    const reminderTaskId = task?.id ?? "";
    await withUser(admin, async (tx) => {
      await tx`update production_tasks set labor_due_at = ${due.toJSDate()} where id = ${reminderTaskId}`;
    }, { scheduling: true });
    const now = DateTime.fromISO("2026-11-03T08:00", { zone: LAB_ZONE }).toJSDate();
    const first = await runReminderJob(now);
    const second = await runReminderJob(now);
    expect(first.skipped).toBe(false);
    expect(first.created).toBeGreaterThan(0);
    expect(second.created).toBe(0);
    const notes = await listNotifications(tech);
    const reminders = notes.filter((note) => note.task_id === task?.id && note.title === "Upcoming Production Task");
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.body).toContain("Dentist Code: DR-027");
    expect(reminders[0]?.body).not.toContain(clinicName);
    const mine = await listMyTasks(tech, {});
    expect(mine.some((item) => item.id === task?.id)).toBe(true);
  });

  it("imports a spreadsheet without scheduling historical rows or duplicating case numbers", async () => {
    const number = `ZN-IMP-${Date.now()}`;
    const csv = Buffer.from(`Case Number,Dentist Code,Patient Name,PAN Number,Case Type,Tooth Numbers,Received,Delivery\n${number},DR-014,Maya Chen,PAN-3001,other,21,2026-11-01,2026-11-20\n${number},DR-014,Maya Chen,PAN-3001,other,21,2026-11-01,2026-11-20\n,DR-014,Maya Chen,PAN-3001,other,21,not-a-date,2026-11-20\n`);
    const mapping = {
      "Case Number": "case_number" as const,
      "Dentist Code": "dentist_code" as const,
      "Patient Name": "patient_name" as const,
      "PAN Number": "pan_number" as const,
      "Case Type": "case_type" as const,
      "Tooth Numbers": "tooth_numbers" as const,
      Received: "received_at" as const,
      Delivery: "requested_delivery_at" as const,
    };
    const imported = await commitImport(desk, "cases.csv", csv, mapping, "skip_existing", true);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.created, JSON.stringify(imported)).toBe(1);
    expect(imported.duplicates).toBe(1);
    expect(imported.invalid).toBe(1);
    const sql = await getSql();
    const [row] = await sql<{ historical: boolean; id: string }[]>`select id, historical from cases where case_number = ${number}`;
    expect(row.historical).toBe(true);
    const tasks = await sql<{ id: string }[]>`select id from production_tasks where case_id = ${row.id}`;
    expect(tasks).toHaveLength(0);
  });

  it("rejects a second completion when the task version changed", async () => {
    const created = await createCase(desk, input(otherTemplate, { caseNumber: `ZN-RACE-${Date.now()}`, panNumber: `PAN-RACE-${Date.now()}`, requestedDeliveryAt: DateTime.now().setZone(LAB_ZONE).plus({ days: 12 }).toISO() ?? "" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await releaseCase(desk, created.id, true)).ok).toBe(true);
    const task = (await getCase(desk, created.id))?.tasks[0];
    const started = await transitionTask(tech, task?.id ?? "", "start", { version: task?.version ?? 1 });
    expect(started.ok, JSON.stringify(started)).toBe(true);
    const current = await getTask(tech, task?.id ?? "");
    const checked = current?.checklist.filter((item) => item.required).map((item) => item.id) ?? [];
    const version = current?.task.version ?? 1;
    const [first, second] = await Promise.all([
      transitionTask(tech, task?.id ?? "", "complete", { version, checkedIds: checked }),
      transitionTask(tech, task?.id ?? "", "complete", { version, checkedIds: checked }),
    ]);
    const results = [first.ok, second.ok];
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("does not let a department lead see clinic identity unless it was granted", async () => {
    const created = await createCase(desk, input(otherTemplate, { caseNumber: `ZN-LEAD-${Date.now()}`, panNumber: `PAN-LEAD-${Date.now()}`, requestedDeliveryAt: DateTime.now().setZone(LAB_ZONE).plus({ days: 48 }).toISO() ?? "" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await releaseCase(desk, created.id, true)).ok).toBe(true);
    const detail = await getCase(lead, created.id);
    expect(detail?.case.clinic).toBeUndefined();
    expect(JSON.stringify(detail)).not.toContain(clinicName);
    const managerView = await getCase(manager, created.id);
    expect(managerView?.case.clinic).toBeUndefined();
  });
});
