import Link from "next/link";
import { PanMark, ProductMark } from "@/components/case-marks";
import { formatStamp } from "@/lib/format";
import type { FinishedCaseRow } from "@/lib/domain/bench-finish";

export function FinishedCaseTable({ rows, showOffice }: { rows: FinishedCaseRow[]; showOffice: boolean }) {
  if (rows.length === 0) return <p className="px-4 py-4 text-sm">No cases finished on this day.</p>;
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
            <td data-label="Finished">{formatStamp(row.finished_at)}</td>
            <td data-label="By">{row.technician_name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
