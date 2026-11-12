import Link from "next/link";
import { caseIsNegarProduct } from "@/lib/bench-board";
import { FinishCaseButton } from "@/components/finish-case-button";
import { PanMark, ProductMark } from "@/components/case-marks";
import { StatusPill } from "@/components/status-pill";
import { dueSheetLabel } from "@/lib/scheduling/calendar";

export type OpenCaseRow = {
  id: string;
  case_number: string;
  patient_name: string;
  pan_number: string;
  case_type: string;
  requested_delivery_at: Date | null;
  overall_status: string;
  tracker_status: string;
  tracker_due: string;
  clinic_name: string | null;
};

export function OpenCaseTable({
  rows,
  showOffice,
  finishReturnTo,
}: {
  rows: OpenCaseRow[];
  showOffice: boolean;
  finishReturnTo?: string;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Case</th>
          {showOffice ? <th>Office</th> : null}
          <th>Patient</th>
          <th>PAN</th>
          <th>Type</th>
          <th>Due</th>
          <th>Status</th>
          {finishReturnTo ? <th></th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td data-label="Case"><Link className="text-teal-800" href={`/cases/${row.id}`}>{row.case_number}</Link></td>
            {showOffice ? <td data-label="Office">{row.clinic_name || "—"}</td> : null}
            <td data-label="Patient">{row.patient_name}</td>
            <td data-label="PAN"><PanMark value={row.pan_number} status={row.overall_status} /></td>
            <td data-label="Type"><ProductMark name={row.case_type} /></td>
            <td data-label="Due">{dueSheetLabel(row.tracker_due, row.requested_delivery_at)}</td>
            <td data-label="Status"><StatusPill value={row.overall_status} trackerStatus={row.tracker_status} /></td>
            {finishReturnTo ? (
              <td data-label="Finish">
                {row.overall_status === "in_production" && caseIsNegarProduct(row.case_type) ? (
                  <FinishCaseButton caseId={row.id} returnTo={finishReturnTo} />
                ) : null}
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
