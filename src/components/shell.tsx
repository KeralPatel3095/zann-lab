import { LabChrome } from "@/components/lab-nav";
import { LiveRefresh } from "@/components/live-refresh";
import { canSeeProductionReport } from "@/lib/bench-board";
import { hasBackendAccess, hasManagementAccess, hasReceiptsAccess } from "@/lib/domain/common";
import { roleLabels } from "@/lib/labels";
import type { Actor } from "@/lib/privacy";

const links = [
  { href: "/", label: "Today", group: "primary" as const },
  { href: "/worksheet", label: "Worksheet", group: "primary" as const, worksheetOnly: true },
  { href: "/due/week", label: "Week ahead", group: "primary" as const },
  { href: "/cases", label: "Cases", group: "primary" as const },
  { href: "/production", label: "Production", group: "primary" as const, productionOnly: true },
  { href: "/tasks", label: "My tasks", group: "floor" as const },
  { href: "/department", label: "Department", group: "floor" as const },
  { href: "/chat", label: "Chat", group: "floor" as const },
  { href: "/notifications", label: "Notifications", group: "floor" as const },
  { href: "/receipts", label: "Sending", group: "office" as const, receiptsOnly: true },
  { href: "/manage", label: "Management", group: "office" as const, managersOnly: true },
  { href: "/import", label: "Import", group: "office" as const, backendOnly: true },
  { href: "/account", label: "Password", group: "office" as const, backendOnly: true },
  { href: "/admin", label: "Admin", group: "office" as const, backendOnly: true },
];

export async function Shell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  // Skip per-navigation chat badge query — it added a full DB round-trip on every click.
  const backend = hasBackendAccess(actor);
  const receipts = hasReceiptsAccess(actor);
  const managers = hasManagementAccess(actor);
  const production = canSeeProductionReport(actor);
  const worksheet = actor.role === "technician";
  const visible = links.filter(
    (link) =>
      (!link.backendOnly || backend) &&
      (!link.receiptsOnly || receipts) &&
      (!link.managersOnly || managers) &&
      (!link.productionOnly || production) &&
      (!link.worksheetOnly || worksheet),
  );
  return (
    <div className="lab-app">
      <LabChrome links={visible} name={actor.fullName} role={actor.jobTitle.trim() || roleLabels[actor.role] || actor.role} />
      <LiveRefresh />
      <main className="lab-main">{children}</main>
    </div>
  );
}
