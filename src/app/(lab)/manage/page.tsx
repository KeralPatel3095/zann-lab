import Link from "next/link";
import { ProductMark } from "@/components/case-marks";
import { requireActorPage } from "@/lib/auth/current";
import { managementSummary } from "@/lib/domain/reports";

export default async function ManagePage() {
  const actor = await requireActorPage();
  const data = await managementSummary(actor.id);
  if (!data) return <p>Management is limited to managers.</p>;
  const cards = [
    ["In the lab", data.totals.in_lab, "Still need to be finished", "/cases?status=in_production"],
    ["Ready to pack", data.totals.ready_to_pack, "Made, waiting to pack", "/cases?status=ready_for_dispatch"],
    ["This week", data.thisWeek, "On the weekday list", "/due/week"],
    ["Late", data.totals.late, "In the lab and past the due date", "/cases?status=in_production&indicator=overdue"],
  ] as const;
  return (
    <div className="grid gap-5">
      <header>
        <p className="lab-kicker">Management</p>
        <h1 className="mt-1 text-3xl">What needs attention</h1>
        <p className="mt-1 max-w-2xl text-sm">In the lab means finish the work. Ready to pack means it is made. Finished cases stay off this page.</p>
      </header>
      <section className="lab-stats grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, detail, href]) => (
          <Link key={label} href={href} className={`lab-card p-4 no-underline ${label === "Late" && value > 0 ? "lab-card-alert" : ""}`}>
            <p className="text-xs uppercase tracking-wide text-[#636466]">{label}</p>
            <p className="lab-count mt-2 text-3xl font-semibold text-[#545658]">{value}</p>
            <p className="mt-2 text-sm">{detail}</p>
          </Link>
        ))}
      </section>
      <section className="lab-card lab-sheet">
        <div className="px-4 pt-4">
          <h2 className="text-xl">In the lab, by product</h2>
          <p className="mt-1 text-sm">Only cases that still need to be finished.</p>
        </div>
        <table className="mt-2">
          <thead><tr><th>Product</th><th>Cases</th></tr></thead>
          <tbody>
            {data.products.map((row) => (
              <tr key={row.case_type || "unspecified"}>
                <td data-label="Product"><ProductMark name={row.case_type} /></td>
                <td data-label="Cases">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.products.length === 0 ? <p className="p-4 text-sm">Nothing is in the lab right now.</p> : null}
      </section>
    </div>
  );
}
