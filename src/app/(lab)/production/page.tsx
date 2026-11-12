import Link from "next/link";
import { FinishedCaseTable } from "@/components/finished-case-table";
import { requireActorPage } from "@/lib/auth/current";
import { productionReport } from "@/lib/domain/bench-finish";
import { canViewClinicIdentity } from "@/lib/privacy";

export default async function ProductionPage() {
  const actor = await requireActorPage();
  const report = await productionReport(actor.id);
  if (!report) return <p>The production report is for Ana, Keral, and Parneet.</p>;
  const showOffice = canViewClinicIdentity(actor);
  const today = report.days[0];
  return (
    <div className="grid gap-5">
      <header>
        <p className="text-sm"><Link href="/">Today</Link></p>
        <p className="lab-kicker mt-3">Negar only</p>
        <h1 className="mt-1 text-3xl">Daily production</h1>
        <p className="mt-1 max-w-2xl text-sm">
          {report.technicianName} finished {today?.cases.length ?? 0} {(today?.cases.length ?? 0) === 1 ? "case" : "cases"} today.
          Each day lists only the cases she marked finished. Other technicians are not included.
        </p>
      </header>
      {report.days.map((day) => (
        <section key={day.workDate} className="lab-card lab-sheet">
          <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
            <h2 className="text-lg">{day.label}</h2>
            <p className="text-sm">{day.cases.length} {day.cases.length === 1 ? "case" : "cases"}</p>
          </div>
          <FinishedCaseTable rows={day.cases} showOffice={showOffice} />
        </section>
      ))}
    </div>
  );
}
