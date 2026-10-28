export function sheetStatus(trackerStatus: string, overallStatus: string) {
  const value = trackerStatus.trim().toLowerCase();
  if (value === "scheduled") return { text: "Finished", tone: "delivered" };
  if (value === "packing") return { text: "Ready to pack", tone: "ready_for_dispatch" };
  if (value === "in lab") return { text: "In lab", tone: "in_production" };
  if (value.includes("streamline")) return { text: "Back from Streamline", tone: "in_production" };
  if (value.includes("argen")) return { text: "Back from Argen", tone: "in_production" };
  return { text: label(caseStatusLabels, overallStatus), tone: overallStatus };
}

export const caseStatusLabels: Record<string, string> = {
  draft: "Draft",
  awaiting_validation: "Awaiting Validation",
  on_hold: "On Hold",
  ready_for_production: "Ready for Production",
  in_production: "In Production",
  awaiting_quality_control: "Awaiting Quality Control",
  rework_required: "Rework Required",
  ready_for_dispatch: "Ready for Dispatch",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const taskStatusLabels: Record<string, string> = {
  waiting: "Waiting",
  ready_to_start: "Ready to Start",
  in_progress: "In Progress",
  paused: "Paused",
  blocked: "Blocked",
  awaiting_approval: "Awaiting Approval",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const indicatorLabels: Record<string, string> = {
  on_track: "On Track",
  due_soon: "Due Soon",
  at_risk: "At Risk",
  overdue: "Overdue",
};

export const priorityLabels: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  rush: "Rush",
};

export const blockerLabels: Record<string, string> = {
  missing_prescription: "Missing prescription information",
  missing_scan_or_impression: "Missing scan or impression",
  incomplete_records: "Incomplete case records",
  awaiting_dentist_clarification: "Awaiting dentist clarification",
  material_unavailable: "Material unavailable",
  equipment_issue: "Equipment or manufacturing issue",
  remake_or_qc_failure: "Remake or quality-control failure",
  technician_capacity: "Technician capacity issue",
  other: "Other",
};

export const roleLabels: Record<string, string> = {
  administrator: "Administrator",
  front_desk: "Front Desk",
  technician: "Technician",
  department_lead: "Department Lead",
  production_manager: "Production Manager",
};

export function label(map: Record<string, string>, value: string) {
  return map[value] ?? value;
}
