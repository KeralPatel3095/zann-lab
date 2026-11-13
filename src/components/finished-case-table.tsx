import Link from "next/link";
import { PanMark, ProductMark } from "@/components/case-marks";
import { UndoFinishButton } from "@/components/finish-case-button";
import { removeDailyReportItemAction } from "@/server/actions";
import { formatStamp } from "@/lib/format";
import type { FinishedCaseRow } from "@/lib/domain/bench-finish";
import type { DailyReportItem } from "@/lib/domain/daily-production";
import { benchRowClass } from "@/lib/product-routing";

export type WorksheetAddedRow = DailyReportItem & {
  technicianName: string;
  removable: boolean;
};

function addedDetail(row: WorksheetAddedRow) {
  const detail = [row.kind === "started" ? "Started" : "", row.note].filter(Boolean).join(" — ");
  const when = formatStamp(row.finishedAt);
  if (!detail) return when;
  return when === "—" ? detail : `${when} — ${detail}`;
}

export function FinishedCaseTable({
  rows,
  added = [],
  showOffice,
  allowUndo = false,
}: {
  rows: FinishedCaseRow[];
  added?: WorksheetAddedRow[];
  showOffice: boolean;
  allowUndo?: boolean;
}) {
  const showAction = allowUndo || added.some((row) => row.removable);
  if (rows.length === 0 && added.length === 0) return <p className="px-4 py-4 text-sm">No cases finished on this day.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Case</th>
          {showOffice ? <th>Office</th> : null}
          <th>Patient</th>
          <th>PAN</th>
          <th>Type</th>
          <th>Finished</th>
          <th>By</th>
          {showAction ? <th></th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className={benchRowClass(row.case_type)}>
            <td data-label="Case"><Link className="text-teal-800" href={`/cases/${row.id}`}>{row.case_number}</Link></td>
            {showOffice ? <td data-label="Office">{row.clinic_name || "—"}</td> : null}
            <td data-label="Patient">{row.patient_name}</td>
            <td data-label="PAN"><PanMark value={row.pan_number} status={row.overall_status} /></td>
            <td data-label="Type"><ProductMark name={row.case_type} /></td>
            <td data-label="Finished">{formatStamp(row.finished_at)}</td>
            <td data-label="By">{row.technician_name}</td>
            {showAction ? (
              <td data-label="Delete">{allowUndo ? <UndoFinishButton caseId={row.id} /> : null}</td>
            ) : null}
          </tr>
        ))}
        {added.map((row) => (
          <tr key={row.id} className={benchRowClass(row.caseType)}>
            <td data-label="Case">
              {row.caseId ? <Link className="text-teal-800" href={`/cases/${row.caseId}`}>{row.caseNumber}</Link> : row.caseNumber}
            </td>
            {showOffice ? <td data-label="Office">—</td> : null}
            <td data-label="Patient">{row.patientName || "—"}</td>
            <td data-label="PAN"><PanMark value={row.panNumber} status={row.overallStatus} /></td>
            <td data-label="Type"><ProductMark name={row.caseType} /></td>
            <td data-label="Finished">{addedDetail(row)}</td>
            <td data-label="By">{row.technicianName}</td>
            {showAction ? (
              <td data-label="Remove">
                {row.removable ? (
                  <form action={removeDailyReportItemAction}>
                    <input type="hidden" name="item_id" value={row.id} />
                    <button className="lab-btn lab-btn-compact lab-btn-undo" type="submit">Remove</button>
                  </form>
                ) : null}
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
