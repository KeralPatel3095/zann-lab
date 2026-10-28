import Link from "next/link";
import { PanMark, ProductMark } from "@/components/case-marks";
import { StatusPill } from "@/components/status-pill";
import { requireActorPage } from "@/lib/auth/current";
import { listCases } from "@/lib/domain/cases";
import { formatStamp } from "@/lib/format";
import { caseStatusLabels, indicatorLabels } from "@/lib/labels";
import { canViewClinicIdentity } from "@/lib/privacy";

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; indicator?: string; page?: string }> }) {
  const actor = await requireActorPage();
  const params = await searchParams;
  const result = await listCases(actor.id, {
    q: params.q,
    status: params.status,
    indicator: params.indicator,
    page: Number(params.page ?? 1),
  });
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="lab-kicker">Case tracker</p>
          <h1 className="mt-1 text-3xl">Cases</h1>
        </div>
      </div>
      <form className="lab-card grid gap-3 p-4 md:grid-cols-4">
        <label>Search<input name="q" defaultValue={params.q ?? ""} placeholder="Case, PAN, dentist code, patient" /></label>
        <label>Status
          <select name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {Object.entries(caseStatusLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
        <label>Risk
          <select name="indicator" defaultValue={params.indicator ?? ""}>
            <option value="">Any risk</option>
            {Object.entries(indicatorLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
        <div className="flex items-end"><button className="rounded-md border border-[#545658] bg-white px-4 py-2 text-sm text-[#545658]">Filter</button></div>
      </form>
      <div className="lab-card lab-sheet">
        <table>
          <thead>
            <tr>
              <th>Case</th><th>{canViewClinicIdentity(actor) ? "Office" : "Dentist code"}</th><th>Patient</th><th>PAN</th><th>Type</th><th>Due</th><th>Stage</th><th>Status</th><th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.id}>
                <td data-label="Case"><Link className="text-teal-800" href={`/cases/${row.id}`}>{row.caseNumber}</Link></td>
                <td data-label={canViewClinicIdentity(actor) ? "Office" : "Dentist"}>{row.clinic?.clinicName || row.dentistCode}</td>
                <td data-label="Patient">{row.patientName}</td>
                <td data-label="PAN"><PanMark value={row.panNumber} status={row.overallStatus} /></td>
                <td data-label="Type"><ProductMark name={row.caseType} /></td>
                <td data-label="Due">{formatStamp(row.requestedDeliveryAt)}</td>
                <td data-label="Stage">{row.currentStage ?? "—"}</td>
                <td data-label="Status"><StatusPill value={row.overallStatus} trackerStatus={row.trackerStatus} /></td>
                <td data-label="Risk"><StatusPill value={row.deadlineIndicator} kind="indicator" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-zinc-500">{result.total} cases. Page {result.page}.</p>
      <p className="text-sm"><a className="text-teal-800" href={`/api/export?format=xlsx`}>Export spreadsheet</a></p>
    </div>
  );
}
