import Link from "next/link";
import { DateTime } from "luxon";
import { DailyReportCard, SubmittedReport } from "@/components/daily-report";
import { canSeeProductionReport } from "@/lib/bench-board";
import { requireActorPage } from "@/lib/auth/current";
import { myDailyReport, productionReports } from "@/lib/domain/daily-production";
import { LAB_ZONE } from "@/lib/scheduling/calendar";

export default async function WorksheetPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActorPage();
  const query = await searchParams;
  const technician = actor.role === "technician";
  const office = canSeeProductionReport(actor);
  if (!technician && !office) return <p>This page is unavailable.</p>;
  const today = DateTime.now().setZone(LAB_ZONE);
  const day = today.toISODate() ?? "";
  const mine = technician ? await myDailyReport(actor.id) : null;
  const submitted = office ? await productionReports(actor.id, day, day) : [];
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
