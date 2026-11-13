import Link from "next/link";
import { PanMark, ProductMark } from "@/components/case-marks";
import { StatusPill } from "@/components/status-pill";
import { requireActorPage } from "@/lib/auth/current";
import { listCases } from "@/lib/domain/cases";
import { formatStamp } from "@/lib/format";
import { dueSheetLabel } from "@/lib/scheduling/calendar";
import { caseStatusLabels, indicatorLabels } from "@/lib/labels";
import { canViewClinicIdentity } from "@/lib/privacy";
import { benchRowClass } from "@/lib/product-routing";

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; indicator?: string; page?: string }> }) {
  const actor = await requireActorPage();
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const result = await listCases(actor.id, {
    q: params.q,
    status: params.status,
    indicator: params.indicator,
    page,
  });
  const pages = Math.max(1, Math.ceil(result.total / 50));
  const queryFor = (nextPage: number) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.status) search.set("status", params.status);
    if (params.indicator) search.set("indicator", params.indicator);
    if (nextPage > 1) search.set("page", String(nextPage));
    const text = search.toString();
    return text ? `/cases?${text}` : "/cases";
  };
  return (
    <div className="grid gap-4">
      <div>
        <p className="lab-kicker">Case tracker</p>
        <h1 className="mt-1 text-3xl">Cases</h1>
        <p className="mt-1 text-sm">{result.openOnly ? "Open cases" : "Search results"}</p>
      </div>
      <form method="get" className="lab-card grid gap-3 p-4 md:grid-cols-4">
        <label>Search<input name="q" defaultValue={params.q ?? ""} placeholder="Case, patient, or PAN" /></label>
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
        <div className="flex items-end gap-2">
          <button className="rounded-md border border-[#545658] bg-white px-4 py-2 text-sm text-[#545658]">Search</button>
          {params.q || params.status || params.indicator ? <Link href="/cases" className="text-sm text-teal-800">Clear</Link> : null}
        </div>
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
              <tr key={row.id} className={benchRowClass(row.caseType)}>
                <td data-label="Case"><Link className="text-teal-800" href={`/cases/${row.id}`}>{row.caseNumber}</Link></td>
                <td data-label={canViewClinicIdentity(actor) ? "Office" : "Dentist"}>{row.clinic?.clinicName || row.dentistCode}</td>
                <td data-label="Patient">{row.patientName}</td>
                <td data-label="PAN"><PanMark value={row.panNumber} status={row.overallStatus} /></td>
                <td data-label="Type"><ProductMark name={row.caseType} /></td>
                <td data-label="Due">{row.trackerDue ? dueSheetLabel(row.trackerDue, row.requestedDeliveryAt) : formatStamp(row.requestedDeliveryAt)}</td>
                <td data-label="Stage">{row.currentStage ?? "—"}</td>
                <td data-label="Status"><StatusPill value={row.overallStatus} trackerStatus={row.trackerStatus} /></td>
                <td data-label="Risk"><StatusPill value={row.deadlineIndicator} kind="indicator" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.rows.length === 0 ? <p className="px-4 py-4 text-sm">No cases match that search.</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-zinc-500">{result.total} {result.openOnly ? "open cases" : "cases"}. Page {result.page} of {pages}.</p>
        <p className="flex gap-3">
          {result.page > 1 ? <Link className="text-teal-800" href={queryFor(result.page - 1)}>Previous</Link> : null}
          {result.page < pages ? <Link className="text-teal-800" href={queryFor(result.page + 1)}>Next</Link> : null}
        </p>
      </div>
      <p className="text-sm"><a className="text-teal-800" href={`/api/export?format=xlsx`}>Export spreadsheet</a></p>
    </div>
  );
}
