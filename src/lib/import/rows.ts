export const importFields = [
  "case_number",
  "dentist_code",
  "patient_name",
  "pan_number",
  "case_type",
  "tooth_numbers",
  "material",
  "shade",
  "received_at",
  "requested_delivery_at",
  "prescription",
  "units",
  "priority",
  "status",
] as const;

export type ImportField = (typeof importFields)[number];

const synonyms: Record<ImportField, string[]> = {
  case_number: ["case number", "case no", "case #", "caseno", "case id"],
  dentist_code: ["dentist code", "doctor code", "dr code", "account code", "dentist"],
  patient_name: ["patient name", "patient"],
  pan_number: ["pan number", "pan no", "pan #", "pan"],
  case_type: ["case type", "type", "product", "restoration"],
  tooth_numbers: ["tooth", "tooth numbers", "teeth", "tooth no"],
  material: ["material"],
  shade: ["shade"],
  received_at: ["received", "date in", "received date", "in date"],
  requested_delivery_at: ["delivery", "due", "due date", "date due", "requested delivery"],
  prescription: ["prescription", "instructions", "notes", "rx"],
  units: ["units", "unit count", "qty"],
  priority: ["priority", "rush"],
  status: ["status"],
};

export function suggestMapping(headers: string[]) {
  const mapping: Record<string, ImportField | ""> = {};
  const used = new Set<ImportField>();
  for (const header of headers) {
    const normalized = header.trim().toLowerCase();
    const match = importFields.find((field) => !used.has(field) && (field.replaceAll("_", " ") === normalized || synonyms[field].includes(normalized)));
    mapping[header] = match ?? "";
    if (match) used.add(match);
  }
  return mapping;
}

export type MappedRow = Partial<Record<ImportField, string>>;

export function mapRow(headers: string[], values: string[], mapping: Record<string, ImportField | "">): MappedRow {
  const mapped: MappedRow = {};
  headers.forEach((header, index) => {
    const field = mapping[header];
    if (!field) return;
    mapped[field] = values[index]?.trim() ?? "";
  });
  return mapped;
}

export function classifyImportRow(row: MappedRow, existingCaseNumbers: Set<string>, mode: "skip_existing" | "fill_blanks") {
  const errors: string[] = [];
  if (!row.case_number) errors.push("Case number is required.");
  if (!row.patient_name) errors.push("Patient name is required.");
  if (!row.dentist_code) errors.push("Dentist code is required.");
  if (row.received_at && Number.isNaN(Date.parse(row.received_at))) errors.push("Received date is invalid.");
  if (row.requested_delivery_at && Number.isNaN(Date.parse(row.requested_delivery_at))) errors.push("Delivery date is invalid.");
  const duplicate = row.case_number ? existingCaseNumbers.has(row.case_number.toLowerCase()) : false;
  if (errors.length) return { disposition: "invalid" as const, errors };
  if (duplicate) return { disposition: mode === "fill_blanks" ? "update" as const : "duplicate" as const, errors: duplicate ? ["Case number already exists."] : [] };
  return { disposition: "create" as const, errors: [] };
}
