import { LabChrome } from "@/components/lab-nav";
import { canSeeProductionReport } from "@/lib/bench-board";
import { hasBackendAccess, hasManagementAccess, hasReceiptsAccess } from "@/lib/domain/common";
import { roleLabels } from "@/lib/labels";
import type { Actor } from "@/lib/privacy";

const links = [
  { href: "/", label: "Today" },
  { href: "/due/week", label: "Week ahead" },
  { href: "/cases", label: "Cases" },
  { href: "/production", label: "Production", productionOnly: true },
  { href: "/receipts", label: "Sending", receiptsOnly: true },
  { href: "/chat", label: "Chat" },
  { href: "/tasks", label: "My tasks" },
  { href: "/department", label: "Department" },
  { href: "/manage", label: "Management", managersOnly: true },
  { href: "/import", label: "Import", backendOnly: true },
  { href: "/notifications", label: "Notifications" },
  { href: "/account", label: "Password", backendOnly: true },
  { href: "/admin", label: "Admin", backendOnly: true },
];

export async function Shell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  // Skip per-navigation chat badge query — it added a full DB round-trip on every click.
  const backend = hasBackendAccess(actor);
  const receipts = hasReceiptsAccess(actor);
  const managers = hasManagementAccess(actor);
  const production = canSeeProductionReport(actor);
  const visible = links.filter(
    (link) =>
      (!link.backendOnly || backend) &&
      (!link.receiptsOnly || receipts) &&
      (!link.managersOnly || managers) &&
      (!link.productionOnly || production),
  );
  return (
    <div className="lab-app">
      <LabChrome links={visible} name={actor.fullName} role={actor.jobTitle.trim() || roleLabels[actor.role] || actor.role} />
      <main className="lab-main">{children}</main>
    </div>
  );
}
