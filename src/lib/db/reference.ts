import { getSql } from "./sql";

const departments = [
  ["Nightguards and Sports Guards", "Night guards, sports guards, and similar appliances.", 1],
  ["Crowns and Bridges", "Crown and bridge fabrication.", 2],
  ["Dentures, Partials, and Repairs", "Dentures, partial dentures, repairs, and relines.", 3],
  ["Digital Design and CAD/CAM", "Scan validation, CAD design, and digital manufacturing preparation.", 4],
  ["Implant Restorations", "Implant-supported restorations.", 5],
  ["Finishing and Quality Control", "Finishing, quality control, and dispatch preparation.", 6],
  ["Other Laboratory Services", "Laboratory work that is not assigned to a specialist department.", 7],
] as const;

const qcItems = [
  ["Case identification verified", true],
  ["Prescription requirements checked", true],
  ["Required units and tooth numbers verified", true],
  ["Applicable fit and contact checks completed", true],
  ["Applicable occlusal checks completed", false],
  ["Material and shade verified", true],
  ["Surface finish and restoration integrity checked", true],
  ["Required technical documentation completed", true],
] as const;

const packItems = [
  ["Case number matches the packaged work", true],
  ["Final packaging verified", true],
] as const;

const basicItems = [
  ["Case identification verified", true],
  ["Stage work matches the prescription", true],
] as const;

type StageDef = {
  name: string;
  department: string;
  work: number;
  elapsed?: number;
  required?: boolean;
  approval?: boolean;
  skippable?: boolean;
  quality?: boolean;
  dispatch?: boolean;
};

const templates: { name: string; caseType: string; description: string; stages: StageDef[] }[] = [
  {
    name: "Crown and bridge",
    caseType: "crown_bridge",
    description: "Placeholder crown and bridge route. Durations are configuration samples, not measured laboratory standards.",
    stages: [
      { name: "Intake and prescription verification", department: "Crowns and Bridges", work: 30 },
      { name: "Physical model preparation or digital scan validation", department: "Crowns and Bridges", work: 45 },
      { name: "CAD design", department: "Digital Design and CAD/CAM", work: 90 },
      { name: "Design review", department: "Digital Design and CAD/CAM", work: 20, required: false, approval: true, skippable: true },
      { name: "Milling, printing, or other manufacturing", department: "Crowns and Bridges", work: 60 },
      { name: "Sintering, crystallization, or material-specific processing", department: "Crowns and Bridges", work: 15, elapsed: 480 },
      { name: "Porcelain layering, characterization, staining, or glazing", department: "Crowns and Bridges", work: 120, required: false, skippable: true },
      { name: "Finishing", department: "Finishing and Quality Control", work: 45 },
      { name: "Quality control", department: "Finishing and Quality Control", work: 30, approval: true, quality: true },
      { name: "Final packaging and dispatch", department: "Finishing and Quality Control", work: 20, dispatch: true },
    ],
  },
  {
    name: "Nightguards and sports guards",
    caseType: "nightguard",
    description: "Placeholder night guard and sports guard route. Confirm each stage with the department lead.",
    stages: [
      { name: "Intake and records validation", department: "Nightguards and Sports Guards", work: 20 },
      { name: "Scan or model preparation", department: "Nightguards and Sports Guards", work: 30 },
      { name: "Digital design", department: "Digital Design and CAD/CAM", work: 45 },
      { name: "Printing or appliance fabrication", department: "Nightguards and Sports Guards", work: 40, elapsed: 90 },
      { name: "Removal, trimming, and contouring", department: "Nightguards and Sports Guards", work: 30 },
      { name: "Fit and thickness verification", department: "Nightguards and Sports Guards", work: 20 },
      { name: "Occlusal adjustment", department: "Nightguards and Sports Guards", work: 20, required: false, skippable: true },
      { name: "Polishing and finishing", department: "Finishing and Quality Control", work: 25 },
      { name: "Final quality control", department: "Finishing and Quality Control", work: 20, approval: true, quality: true },
      { name: "Packaging and dispatch", department: "Finishing and Quality Control", work: 15, dispatch: true },
    ],
  },
  {
    name: "Dentures and partial dentures",
    caseType: "denture",
    description: "Placeholder denture route, including an optional try-in.",
    stages: [
      { name: "Intake and prescription verification", department: "Dentures, Partials, and Repairs", work: 30 },
      { name: "Model preparation or digital model review", department: "Dentures, Partials, and Repairs", work: 40 },
      { name: "Design, tooth setup, or framework planning", department: "Dentures, Partials, and Repairs", work: 90 },
      { name: "Framework fabrication or try-in preparation", department: "Dentures, Partials, and Repairs", work: 60, required: false, skippable: true },
      { name: "Try-in and dentist feedback", department: "Dentures, Partials, and Repairs", work: 30, required: false, approval: true, skippable: true },
      { name: "Final fabrication or processing", department: "Dentures, Partials, and Repairs", work: 120 },
      { name: "Finishing and polishing", department: "Finishing and Quality Control", work: 45 },
      { name: "Quality control", department: "Finishing and Quality Control", work: 25, approval: true, quality: true },
      { name: "Packaging and dispatch", department: "Finishing and Quality Control", work: 15, dispatch: true },
    ],
  },
  {
    name: "Denture repair and reline",
    caseType: "denture_repair",
    description: "Placeholder repair and reline route.",
    stages: [
      { name: "Intake and damage assessment", department: "Dentures, Partials, and Repairs", work: 20 },
      { name: "Repair or reline requirements", department: "Dentures, Partials, and Repairs", work: 20 },
      { name: "Model preparation", department: "Dentures, Partials, and Repairs", work: 30, required: false, skippable: true },
      { name: "Repair or reline processing", department: "Dentures, Partials, and Repairs", work: 60 },
      { name: "Finishing", department: "Finishing and Quality Control", work: 25 },
      { name: "Quality control", department: "Finishing and Quality Control", work: 15, approval: true, quality: true },
      { name: "Packaging and dispatch", department: "Finishing and Quality Control", work: 15, dispatch: true },
    ],
  },
  {
    name: "Implant restorations",
    caseType: "implant",
    description: "Placeholder implant restoration route.",
    stages: [
      { name: "Intake and component verification", department: "Implant Restorations", work: 30 },
      { name: "Scan and records validation", department: "Implant Restorations", work: 30 },
      { name: "CAD design", department: "Digital Design and CAD/CAM", work: 90 },
      { name: "Design approval", department: "Digital Design and CAD/CAM", work: 20, required: false, approval: true, skippable: true },
      { name: "Manufacturing", department: "Implant Restorations", work: 60 },
      { name: "Component integration or material-specific processing", department: "Implant Restorations", work: 30, elapsed: 180 },
      { name: "Finishing and characterization", department: "Finishing and Quality Control", work: 45 },
      { name: "Quality control", department: "Finishing and Quality Control", work: 25, approval: true, quality: true },
      { name: "Packaging and dispatch", department: "Finishing and Quality Control", work: 15, dispatch: true },
    ],
  },
  {
    name: "Other laboratory services",
    caseType: "other",
    description: "A short configurable route for work that does not use a specialist template.",
    stages: [
      { name: "Intake and prescription verification", department: "Other Laboratory Services", work: 20 },
      { name: "Laboratory production", department: "Other Laboratory Services", work: 60 },
      { name: "Quality control", department: "Finishing and Quality Control", work: 20, approval: true, quality: true },
      { name: "Packaging and dispatch", department: "Finishing and Quality Control", work: 15, dispatch: true },
    ],
  },
];

const settings: Record<string, string> = {
  next_case_number: "10500",
  case_number_prefix: "ZN-",
  reminder_local_time: "08:00",
  due_soon_hours: "8",
  dispatch_buffer_minutes: "0",
  timezone: "America/Toronto",
  email_notifications_enabled: "false",
  email_include_patient_details: "false",
  lab_display_name: "ZANN Dental Laboratory",
};

const holidays = [
  ["2026-01-01", "New Year's Day"],
  ["2026-02-16", "Family Day"],
  ["2026-04-03", "Good Friday"],
  ["2026-05-18", "Victoria Day"],
  ["2026-07-01", "Canada Day"],
  ["2026-08-03", "Civic Holiday"],
  ["2026-09-07", "Labour Day"],
  ["2026-10-12", "Thanksgiving"],
  ["2026-12-25", "Christmas Day"],
  ["2026-12-26", "Boxing Day"],
  ["2027-01-01", "New Year's Day"],
];

export async function seedReferenceData() {
  const sql = await getSql();
  await sql.begin(async (tx) => {
    const [existing] = await tx<{ id: string }[]>`select id from departments limit 1`;
    if (existing) return;
    const departmentIds = new Map<string, string>();
    for (const [name, description, sortOrder] of departments) {
      const [row] = await tx<{ id: string }[]>`
        insert into departments (name, description, sort_order)
        values (${name}, ${description}, ${sortOrder})
        returning id
      `;
      departmentIds.set(name, row.id);
    }
    for (const template of templates) {
      const [saved] = await tx<{ id: string }[]>`
        insert into workflow_templates (name, case_type, description)
        values (${template.name}, ${template.caseType}, ${template.description})
        returning id
      `;
      const stageIds: string[] = [];
      for (const [index, stage] of template.stages.entries()) {
        const departmentId = departmentIds.get(stage.department);
        if (!departmentId) throw new Error(`Missing department ${stage.department}`);
        const [row] = await tx<{ id: string }[]>`
          insert into workflow_stages (
            workflow_template_id, stage_name, department_id, sequence, estimated_work_minutes,
            elapsed_minutes, required, requires_approval, skippable, is_quality_gate, is_dispatch_stage
          ) values (
            ${saved.id}, ${stage.name}, ${departmentId}, ${index + 1}, ${stage.work},
            ${stage.elapsed ?? 0}, ${stage.required ?? true}, ${stage.approval ?? false},
            ${stage.skippable ?? false}, ${stage.quality ?? false}, ${stage.dispatch ?? false}
          ) returning id
        `;
        stageIds.push(row.id);
        const items = stage.quality ? qcItems : stage.dispatch ? packItems : basicItems;
        for (const [itemIndex, [label, required]] of items.entries()) {
          await tx`
            insert into stage_checklist_items (stage_id, label, required, sequence)
            values (${row.id}, ${label}, ${required}, ${itemIndex + 1})
          `;
        }
      }
      for (let index = 0; index < stageIds.length - 1; index += 1) {
        await tx`
          insert into stage_dependencies (predecessor_stage_id, successor_stage_id)
          values (${stageIds[index]}, ${stageIds[index + 1]})
        `;
      }
      if (template.caseType === "crown_bridge") {
        const [library] = await tx<{ id: string }[]>`
          insert into quality_checklist_templates (name, case_type, workflow_template_id)
          values (${`${template.name} quality checklist`}, ${template.caseType}, ${saved.id})
          returning id
        `;
        for (const [index, [label, required]] of qcItems.entries()) {
          await tx`
            insert into quality_checklist_items (template_id, label, required, sequence)
            values (${library.id}, ${label}, ${required}, ${index + 1})
          `;
        }
      }
    }
    for (const weekday of [1, 2, 3, 4, 5]) {
      await tx`
        insert into business_hours (weekday, start_minute, end_minute)
        values (${weekday}, 480, 990)
      `;
    }
    for (const [date, description] of holidays) {
      await tx`
        insert into business_calendar (calendar_date, is_working_day, description)
        values (${date}, false, ${description})
      `;
    }
    for (const [key, value] of Object.entries(settings)) {
      await tx`insert into production_settings (setting_key, setting_value) values (${key}, ${value})`;
    }
    const [scheduler] = await tx<{ id: string }[]>`
      insert into profiles (full_name, email, role, can_view_clinic_identity)
      values ('Scheduler', 'scheduler@zann-lab.internal', 'administrator', true)
      returning id
    `;
    await tx`
      insert into production_settings (setting_key, setting_value)
      values ('scheduler_user_id', ${scheduler.id})
    `;
  });
}
