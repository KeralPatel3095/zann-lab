import Link from "next/link";
import { FinishedCaseTable } from "@/components/finished-case-table";
import { requireActorPage } from "@/lib/auth/current";
import { productionReport } from "@/lib/domain/bench-finish";
import { productionReports } from "@/lib/domain/daily-production";
import { canViewClinicIdentity } from "@/lib/privacy";

export default async function ProductionPage() {
  const actor = await requireActorPage();
  const report = await productionReport(actor.id);
  if (!report) return <p>This report is unavailable.</p>;
  const showOffice = canViewClinicIdentity(actor);
  const todayCount = report.days[0]?.cases.length ?? 0;
  const written = await productionReports(
    actor.id,
    report.days[report.days.length - 1]?.workDate ?? "",
    report.days[0]?.workDate ?? "",
  );
  return (
    <div className="grid gap-5">
      <header>
        <p className="text-sm"><Link href="/">Today</Link></p>
        <p className="lab-kicker mt-3">Production</p>
        <h1 className="mt-1 text-3xl">Daily production</h1>
        <p className="mt-1 text-sm">{todayCount} finished today</p>
      </header>
      {report.days.map((day) => (
        <section key={day.workDate} className="lab-card lab-sheet">
          <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
            <h2 className="text-lg">{day.label}</h2>
            <p className="text-sm">{day.cases.length} {day.cases.length === 1 ? "case" : "cases"}</p>
          </div>
          <FinishedCaseTable rows={day.cases} showOffice={showOffice} />
          {written.filter((item) => item.workDate === day.workDate && (item.note || item.items.length > 0)).map((item) => (
            <div key={item.id} className="grid gap-2 px-4 pb-4 text-sm">
              <h3 className="font-semibold">{item.technicianName}</h3>
              {item.note ? <p className="whitespace-pre-wrap">{item.note}</p> : null}
              {item.items.length > 0 ? (
                <ul className="grid gap-1">
                  {item.items.map((line) => (
                    <li key={line.id}>
                      {line.kind === "started" ? "Started" : "Worked on"} · {line.caseNumber}
                      {line.patientName ? ` · ${line.patientName}` : ""}
                      {line.caseType ? ` · ${line.caseType}` : ""}
                      {line.note ? ` — ${line.note}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
