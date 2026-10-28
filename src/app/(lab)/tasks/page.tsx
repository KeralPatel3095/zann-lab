import Link from "next/link";
import { PanMark, ProductMark } from "@/components/case-marks";
import { StatusPill } from "@/components/status-pill";
import { requireActorPage } from "@/lib/auth/current";
import { listMyTasks } from "@/lib/domain/tasks";
import { formatStamp } from "@/lib/format";
import { DateTime } from "luxon";
import { LAB_ZONE } from "@/lib/scheduling/calendar";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const actor = await requireActorPage();
  const params = await searchParams;
  const tasks = await listMyTasks(actor.id, params);
  const today = DateTime.now().setZone(LAB_ZONE).toISODate();
  const tomorrow = DateTime.now().setZone(LAB_ZONE).plus({ days: 1 }).toISODate();
  const groups = [
    ["Overdue", tasks.filter((task) => task.labor_due_at && DateTime.fromJSDate(task.labor_due_at).setZone(LAB_ZONE) < DateTime.now() && !["completed", "cancelled"].includes(task.task_status))],
    ["Today", tasks.filter((task) => task.labor_due_at && DateTime.fromJSDate(task.labor_due_at).setZone(LAB_ZONE).toISODate() === today)],
    ["Tomorrow", tasks.filter((task) => task.labor_due_at && DateTime.fromJSDate(task.labor_due_at).setZone(LAB_ZONE).toISODate() === tomorrow)],
    ["Blocked", tasks.filter((task) => task.task_status === "blocked")],
    ["All matching", tasks],
  ] as const;
  return (
    <div className="grid gap-4">
      <header>
        <p className="lab-kicker">Bench</p>
        <h1 className="mt-1 text-3xl">My tasks</h1>
      </header>
      <form className="lab-card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]">
        <input name="q" defaultValue={params.q ?? ""} placeholder="Case, PAN, patient, or task" />
        <input name="status" defaultValue={params.status ?? ""} placeholder="Status" />
        <button className="self-end rounded-md border border-zinc-300 px-3 py-2 text-sm">Filter</button>
      </form>
      {groups.map(([title, rows]) => (
        <section key={title} className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold">{title}</h2>
          <div className="mt-3 grid gap-2">
            {rows.map((task) => (
              <Link key={`${title}-${task.id}`} href={`/tasks/${task.id}`} className="grid gap-1 rounded-md border border-zinc-200 p-3 text-sm md:grid-cols-[1fr_auto]">
                <span className="flex flex-wrap items-center gap-2">{task.case_number} · {task.dentist_code} · {task.patient_name} · <PanMark value={task.pan_number} status={task.overall_status} /> <ProductMark name={task.case_type} /></span>
                <span>{task.title} · {task.department_name} · {formatStamp(task.labor_due_at)} · <StatusPill value={task.task_status} kind="task" /></span>
              </Link>
            ))}
            {rows.length === 0 ? <p className="text-sm text-zinc-500">None</p> : null}
          </div>
        </section>
      ))}
    </div>
  );
}
