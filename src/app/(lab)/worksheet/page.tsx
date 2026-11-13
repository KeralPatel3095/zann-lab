import Link from "next/link";
import { DateTime } from "luxon";
import { DailyReportCard, SubmittedReport } from "@/components/daily-report";
import { FinishedCaseTable } from "@/components/finished-case-table";
import { canMarkBenchFinish, canSeeProductionReport } from "@/lib/bench-board";
import { requireActorPage } from "@/lib/auth/current";
import { listFinishHistory } from "@/lib/domain/bench-finish";
import { myDailyReport, myReports, productionReports } from "@/lib/domain/daily-production";
import { canViewClinicIdentity } from "@/lib/privacy";
import { LAB_ZONE } from "@/lib/scheduling/calendar";

export default async function WorksheetPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActorPage();
  const query = await searchParams;
  const technician = actor.role === "technician";
  const office = canSeeProductionReport(actor);
  const finishOwn = canMarkBenchFinish(actor);
  if (!technician && !office) return <p>This page is unavailable.</p>;
  const now = DateTime.now().setZone(LAB_ZONE);
  const todayKey = now.toISODate() ?? "";
  const days = [{ workDate: todayKey, label: "Finished today", isToday: true }];
  for (let offset = 1; offset < 21 && days.length < 10; offset += 1) {
    const day = now.minus({ days: offset });
    if (day.weekday > 5) continue;
    days.push({ workDate: day.toISODate() ?? "", label: day.toFormat("cccc d LLLL"), isToday: false });
  }
  const start = days[days.length - 1]?.workDate ?? todayKey;
  const mine = technician ? await myDailyReport(actor.id) : null;
  const written = technician
    ? await myReports(actor.id, start, todayKey)
    : await productionReports(actor.id, start, todayKey);
  const finishes = finishOwn || office ? await listFinishHistory(actor.id) : [];
  const showOffice = canViewClinicIdentity(actor);
  return (
    <div className="grid gap-5">
      {query.notice ? <p className="rounded-md bg-amber-50 p-3 text-sm">{query.notice}</p> : null}
      <header>
        <p className="text-sm"><Link href="/">Today</Link></p>
        <p className="lab-kicker mt-3">Worksheet</p>
        <h1 className="mt-1 text-3xl">Worksheet</h1>
        <p className="mt-1 text-sm">{now.toFormat("cccc, d LLLL yyyy")}</p>
      </header>
      {days.map((day) => {
        const cases = finishes.filter((row) => row.work_date === day.workDate);
        const reports = written.filter((item) => item.workDate === day.workDate && (item.note || item.items.length > 0));
        if (!day.isToday && cases.length === 0 && reports.length === 0) return null;
        const total = cases.length + reports.reduce((sum, item) => sum + item.items.length, 0);
        return (
          <section key={day.workDate} className="lab-card lab-card-done lab-sheet">
            <div className="px-4 pt-4">
              <h2 className="text-xl">{day.label}</h2>
              <p className="mt-1 text-sm">{total} finished</p>
            </div>
            {cases.length > 0 ? (
              <FinishedCaseTable rows={cases} showOffice={showOffice} allowUndo={day.isToday && finishOwn} />
            ) : null}
            {reports.map((item) => (
              <SubmittedReport
                key={item.id}
                report={item}
                editable={day.isToday && technician}
                hideNote={day.isToday && technician}
                showName={office}
              />
            ))}
            {day.isToday && mine ? <DailyReportCard report={mine} /> : null}
          </section>
        );
      })}
    </div>
  );
}
