import Link from "next/link";
import { DateTime } from "luxon";
import { DailyReportCard, SubmittedReport } from "@/components/daily-report";
import { FinishedCaseTable } from "@/components/finished-case-table";
import { canMarkBenchFinish, canSeeProductionReport } from "@/lib/bench-board";
import { requireActorPage } from "@/lib/auth/current";
import { listFinishedBoard, listMyFinishesToday } from "@/lib/domain/bench-finish";
import { myDailyReport, productionReports } from "@/lib/domain/daily-production";
import { canViewClinicIdentity } from "@/lib/privacy";
import { LAB_ZONE } from "@/lib/scheduling/calendar";

export default async function WorksheetPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActorPage();
  const query = await searchParams;
  const technician = actor.role === "technician";
  const office = canSeeProductionReport(actor);
  const finishOwn = canMarkBenchFinish(actor);
  if (!technician && !office) return <p>This page is unavailable.</p>;
  const today = DateTime.now().setZone(LAB_ZONE);
  const day = today.toISODate() ?? "";
  const mine = technician ? await myDailyReport(actor.id) : null;
  const myFinished = finishOwn ? await listMyFinishesToday(actor.id) : [];
  const finishedBoard = office ? await listFinishedBoard(actor.id) : null;
  const submitted = office ? await productionReports(actor.id, day, day) : [];
  const showOffice = canViewClinicIdentity(actor);
  const visible = submitted.filter((item) => item.note || item.items.length > 0);
  return (
    <div className="grid gap-5">
      {query.notice ? <p className="rounded-md bg-amber-50 p-3 text-sm">{query.notice}</p> : null}
      <header>
        <p className="text-sm"><Link href="/">Today</Link></p>
        <p className="lab-kicker mt-3">Worksheet</p>
        <h1 className="mt-1 text-3xl">Worksheet</h1>
        <p className="mt-1 text-sm">{today.toFormat("cccc, d LLLL yyyy")}</p>
      </header>
      {finishOwn ? (
        <section className="lab-card lab-card-done lab-sheet">
          <div className="px-4 pt-4">
            <h2 className="text-xl">Finished today</h2>
            <p className="mt-1 text-sm">{myFinished.length} finished today</p>
          </div>
          <FinishedCaseTable rows={myFinished} showOffice={false} allowUndo />
        </section>
      ) : null}
      {finishedBoard ? (
        <section className="lab-card lab-card-done lab-sheet">
          <div className="px-4 pt-4">
            <h2 className="text-xl">Finished today</h2>
            <p className="mt-1 text-sm">{finishedBoard.length} finished today</p>
          </div>
          <FinishedCaseTable rows={finishedBoard} showOffice={showOffice} />
        </section>
      ) : null}
      {mine ? (
        <section className="lab-card">
          <DailyReportCard report={mine} />
        </section>
      ) : null}
      {office ? (
        <section className="lab-card">
          <div className="px-5 pt-5">
            <h2 className="text-xl">Submitted today</h2>
          </div>
          {visible.map((item) => <SubmittedReport key={item.id} report={item} />)}
          {visible.length === 0 ? <p className="px-5 pb-5 text-sm">Nothing submitted today.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
