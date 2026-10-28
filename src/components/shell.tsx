import { LabChrome } from "@/components/lab-nav";
import { roleLabels } from "@/lib/labels";
import type { Actor } from "@/lib/privacy";

const links = [
  { href: "/", label: "Today", roles: ["administrator", "front_desk", "technician", "department_lead", "production_manager"] },
  { href: "/due/week", label: "Week ahead", roles: ["administrator", "front_desk", "technician", "department_lead", "production_manager"] },
  { href: "/cases", label: "Cases", roles: ["administrator", "front_desk", "technician", "department_lead", "production_manager"] },
  { href: "/tasks", label: "My tasks", roles: ["administrator", "technician", "department_lead", "production_manager"] },
  { href: "/department", label: "Department", roles: ["administrator", "department_lead", "production_manager"] },
  { href: "/manage", label: "Management", roles: ["administrator", "production_manager"] },
  { href: "/import", label: "Import", roles: ["administrator", "front_desk"] },
  { href: "/notifications", label: "Notifications", roles: ["administrator", "front_desk", "technician", "department_lead", "production_manager"] },
  { href: "/account", label: "Password", roles: ["administrator", "front_desk", "technician", "department_lead", "production_manager"] },
  { href: "/admin", label: "Admin", roles: ["administrator"] },
];

export function Shell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const visible = links.filter((link) => link.roles.includes(actor.role));
  return (
    <div className="lab-app">
      <LabChrome links={visible} name={actor.fullName} role={roleLabels[actor.role]} />
      <main className="lab-main">{children}</main>
    </div>
  );
}
