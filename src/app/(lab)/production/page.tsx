import Link from "next/link";
import { FinishedCaseTable, type WorksheetAddedRow } from "@/components/finished-case-table";
import { requireActorPage } from "@/lib/auth/current";
import { productionReport } from "@/lib/domain/bench-finish";
import { productionReports } from "@/lib/domain/daily-production";
import { canViewClinicIdentity } from "@/lib/privacy";

export default async function ProductionPage() {
  const actor = await requireActorPage();
  const report = await productionReport(actor.id);
  if (!report) return <p>This report is unavailable.</p>;
  const showOffice = canViewClinicIdentity(actor);
  const written = await productionReports(
    actor.id,
    report.days[report.days.length - 1]?.workDate ?? "",
    report.days[0]?.workDate ?? "",
  );
  const todayKey = report.days[0]?.workDate ?? "";
  const todayAdded = written.filter((item) => item.workDate === todayKey).reduce((sum, item) => sum + item.items.length, 0);
  const todayCount = (report.days[0]?.cases.length ?? 0) + todayAdded;
  return (
    <div className="grid gap-5">
      <header>
        <p className="text-sm"><Link href="/">Today</Link></p>
        <p className="lab-kicker mt-3">Production</p>
        <h1 className="mt-1 text-3xl">Daily production</h1>
        <p className="mt-1 text-sm">{todayCount} finished today</p>
      </header>
      {report.days.map((day) => {
        const reports = written.filter((item) => item.workDate === day.workDate);
        const added: WorksheetAddedRow[] = reports.flatMap((item) => item.items.map((line) => ({
          ...line,
          technicianName: item.technicianName,
          removable: false,
        })));
        const total = day.cases.length + added.length;
        return (
          <section key={day.workDate} className="lab-card lab-sheet">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
              <h2 className="text-lg">{day.label}</h2>
              <p className="text-sm">{total} {total === 1 ? "case" : "cases"}</p>
            </div>
            {day.cases.length > 0 || added.length > 0 ? (
              <FinishedCaseTable rows={day.cases} added={added} showOffice={showOffice} />
            ) : null}
            {reports.filter((item) => item.note.trim()).map((item) => (
              <p key={item.id} className="whitespace-pre-wrap px-4 pb-4 text-sm">
                <strong>{item.technicianName}.</strong> {item.note}
              </p>
            ))}
          </section>
        );
      })}
    </div>
  );
}
