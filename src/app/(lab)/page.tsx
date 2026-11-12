import Link from "next/link";
import { DateTime } from "luxon";
import { canMarkBenchFinish, canSeeFinishedBoard, caseIsNegarProduct } from "@/lib/bench-board";
import { PanMark, ProductMark, BenchLegend } from "@/components/case-marks";
import { FinishCaseButton } from "@/components/finish-case-button";
import { FinishNotice } from "@/components/finish-notice";
import { FinishedCaseTable } from "@/components/finished-case-table";
import { StatusPill } from "@/components/status-pill";
import { requireActorPage } from "@/lib/auth/current";
import { listFinishedBoard, listMyFinishesToday } from "@/lib/domain/bench-finish";
import { todayBoard } from "@/lib/domain/reports";
import { canViewClinicIdentity } from "@/lib/privacy";
import { dueSheetLabel, LAB_ZONE } from "@/lib/scheduling/calendar";
import { benchRowClass } from "@/lib/product-routing";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActorPage();
  const query = await searchParams;
  const data = await todayBoard(actor.id);
  const showOffice = canViewClinicIdentity(actor);
  const finishOwn = canMarkBenchFinish(actor);
  const finishedBoard = canSeeFinishedBoard(actor) ? await listFinishedBoard(actor.id) : null;
  const myFinished = finishOwn ? await listMyFinishesToday(actor.id) : [];
  const today = DateTime.now().setZone(LAB_ZONE);
  const openTasks = data.myTasks.reduce((sum, row) => sum + row.total, 0);
  const popup = query.notice?.startsWith("Case finished")
    ? { title: "Case finished", message: "Added in You finished today.", anchor: "finished-today" }
    : query.notice?.startsWith("Case returned")
      ? { title: "Case returned", message: "It is back on Finish today.", anchor: "finish-today" }
      : null;
  return (
    <div className="grid gap-5">
      {popup ? <FinishNotice title={popup.title} message={popup.message} anchor={popup.anchor} /> : null}
      {query.notice && !popup ? <p className="rounded-md bg-amber-50 p-3 text-sm">{query.notice}</p> : null}
      <header>
        <p className="lab-kicker">Lab</p>
        <h1 className="mt-1 text-3xl">Today</h1>
        <p className="mt-1 text-sm">{today.toFormat("cccc, d LLLL yyyy")} · Toronto · the Google Sheet updates this desk every few minutes</p>
        <BenchLegend />
        <nav className="lab-jumps mt-4" aria-label="On this page">
          <a href="#finish-today">Finish today <strong>{data.finishToday.length}</strong></a>
          {finishOwn ? <a href="#finished-today">You finished <strong>{myFinished.length}</strong></a> : null}
          {finishedBoard ? <a href="#finished-by-negar">Finished by Negar <strong>{finishedBoard.length}</strong></a> : null}
          <Link href="/cases">Open cases</Link>
        </nav>
        <p className="mt-3 text-sm">
          <span className="lab-count text-3xl font-semibold text-[#545658]">{data.inLab}</span>
          {" "}{data.inLab === 1 ? "case" : "cases"} in the lab
          {data.readyToPack > 0 ? ` · ${data.readyToPack} ready to pack` : ""}
          {data.onHold > 0 ? ` · ${data.onHold} on hold` : ""}
        </p>
      </header>
      {finishOwn ? (
        <section id="finished-today" className="lab-card lab-card-done lab-sheet">
          <div className="px-4 pt-4">
            <h2 className="text-xl">You finished today</h2>
            <p className="mt-1 text-sm">
              {myFinished.length} {myFinished.length === 1 ? "case is" : "cases are"} on Ana, Keral, and Parneet’s board.
              Delete puts a case back on Finish today if it was marked by mistake.
            </p>
          </div>
          <FinishedCaseTable rows={myFinished} showOffice={false} allowUndo />
        </section>
      ) : null}
      <section id="finish-today" className="lab-card lab-card-open p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl">Finish today</h2>
            <p className="mt-1 text-sm">{data.finishToday.length} {data.finishToday.length === 1 ? "case" : "cases"} to finish today</p>
          </div>
          <div className="lab-actions">
            <Link href="/due/tomorrow" className="lab-btn">See the full list</Link>
            <Link href="/due/week" className="lab-btn">Week ahead · {data.finishWeek.length}</Link>
          </div>
        </div>
        <div className="lab-sheet mt-4">
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
                {finishOwn ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {data.finishToday.map((row) => {
                return (
                  <tr key={row.id} className={benchRowClass(row.case_type)}>
                    <td data-label="Case"><Link className="text-teal-800" href={`/cases/${row.id}`}>{row.case_number}</Link></td>
                    {showOffice ? <td data-label="Office">{row.clinic_name || "—"}</td> : null}
                    <td data-label="Patient">{row.patient_name}</td>
                    <td data-label="PAN"><PanMark value={row.pan_number} status={row.overall_status} /></td>
                    <td data-label="Type"><ProductMark name={row.case_type} /></td>
                    <td data-label="Due">{dueSheetLabel(row.tracker_due, row.requested_delivery_at)}</td>
                    <td data-label="Status"><StatusPill value={row.overall_status} trackerStatus={row.tracker_status} /></td>
                    {finishOwn ? (
                      <td data-label="Finish">
                        {caseIsNegarProduct(row.case_type) ? <FinishCaseButton caseId={row.id} returnTo="/" /> : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.finishToday.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No cases to finish today.</p> : null}
        </div>
      </section>
      {finishedBoard ? (
        <section id="finished-by-negar" className="lab-card lab-card-done lab-sheet">
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4">
            <div>
              <h2 className="text-xl">Finished by Negar</h2>
              <p className="mt-1 text-sm">
                {finishedBoard.length} {finishedBoard.length === 1 ? "case" : "cases"} finished today.
                These stay off the open lists so they are not mixed with work still in the lab.
              </p>
            </div>
            <Link href="/production" className="lab-btn">Daily production</Link>
          </div>
          <FinishedCaseTable rows={finishedBoard} showOffice={showOffice} />
        </section>
      ) : null}
      {openTasks > 0 ? (
        <p className="text-sm"><Link href="/tasks">My tasks · {openTasks}</Link></p>
      ) : null}
    </div>
  );
}
