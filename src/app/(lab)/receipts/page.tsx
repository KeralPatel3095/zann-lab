import Link from "next/link";
import { DateTime } from "luxon";
import { requireActorPage } from "@/lib/auth/current";
import { hasReceiptsAccess } from "@/lib/domain/common";
import { sendingVolumeReport } from "@/lib/domain/receipts";
import { evidentCasesEnteredReport } from "@/lib/integrations/evident";
import { LAB_ZONE } from "@/lib/scheduling/calendar";

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const actor = await requireActorPage();
  if (!hasReceiptsAccess(actor)) return <p>This report is limited to Keral and Parneet.</p>;
  const query = await searchParams;
  const [report, evident] = await Promise.all([
    sendingVolumeReport(actor.id, query.day),
    evidentCasesEnteredReport(query.day),
  ]);
  if (!report) return <p>This report is limited to Keral and Parneet.</p>;

  const previous = DateTime.fromISO(report.day, { zone: LAB_ZONE }).minus({ days: 1 }).toISODate();
  const next = DateTime.fromISO(report.day, { zone: LAB_ZONE }).plus({ days: 1 }).toISODate();
  const today = DateTime.now().setZone(LAB_ZONE).toISODate();
  const dayHref = (day: string) => `/receipts?day=${day}`;
  const enteredByDay = new Map(evident.daily.map((row) => [row.day, row.total]));
  const days = [...new Set([...report.daily.map((row) => row.day), ...evident.daily.map((row) => row.day)])].sort((a, b) => b.localeCompare(a));
  const sendingByDay = new Map(report.daily.map((row) => [row.day, row.total]));

  return (
    <div className="grid gap-5">
      <header>
        <p className="lab-kicker">Volume</p>
        <h1 className="mt-1 text-3xl">Daily counts</h1>
        <p className="mt-1 text-sm">Cases due to send, and cases entered today.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="lab-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6b757a]">Sending</h2>
          <p className="mt-1 text-sm">{report.dayLabel}</p>
          <p className="lab-count mt-3 text-5xl font-semibold text-[#2f3437]">{report.todayCount}</p>
          <p className="mt-1 text-sm">cases due to send</p>
        </div>
        <div className="lab-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6b757a]">Entered · Evident</h2>
          <p className="mt-1 text-sm">{report.dayLabel}</p>
          {evident.configured && evident.connected ? (
            <>
              <p className="lab-count mt-3 text-5xl font-semibold text-[#2f3437]">{evident.todayCount}</p>
              <p className="mt-1 text-sm">cases entered</p>
            </>
          ) : (
            <>
              <p className="lab-count mt-3 text-5xl font-semibold text-[#9aa6ab]">—</p>
              <p className="mt-1 text-sm">
                {!evident.configured
                  ? "Add Evident API keys in .env.local to connect."
                  : evident.error || "Evident is not reachable."}
              </p>
            </>
          )}
        </div>
      </section>

      <div className="lab-actions">
        {previous ? <Link href={dayHref(previous)} className="lab-btn">Previous day</Link> : null}
        {today ? <Link href={dayHref(today)} className="lab-btn">Today</Link> : null}
        {next ? <Link href={dayHref(next)} className="lab-btn">Next day</Link> : null}
      </div>

      <section className="lab-card lab-sheet p-0">
        <div className="px-4 pt-4">
          <h2 className="text-lg">Daily totals</h2>
        </div>
        <table className="mt-2">
          <thead>
            <tr>
              <th>Day</th>
              <th>Sending</th>
              <th>Entered</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day}>
                <td data-label="Day">
                  <Link href={dayHref(day)}>{DateTime.fromISO(day, { zone: LAB_ZONE }).toFormat("ccc d LLL")}</Link>
                </td>
                <td data-label="Sending">{sendingByDay.get(day) ?? 0}</td>
                <td data-label="Entered">
                  {evident.configured && evident.connected ? (enteredByDay.get(day) ?? 0) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {days.length === 0 ? <p className="p-4 text-sm text-zinc-500">No daily totals in this window.</p> : null}
      </section>
    </div>
  );
}
