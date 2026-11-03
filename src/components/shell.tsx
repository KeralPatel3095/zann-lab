import { LabChrome } from "@/components/lab-nav";
import { hasBackendAccess, hasManagementAccess, hasReceiptsAccess } from "@/lib/domain/common";
import { unreadChatCount } from "@/lib/domain/chat";
import { roleLabels } from "@/lib/labels";
import type { Actor } from "@/lib/privacy";

const links = [
  { href: "/", label: "Today" },
  { href: "/due/week", label: "Week ahead" },
  { href: "/cases", label: "Cases" },
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
  const unread = await unreadChatCount(actor.id);
  const backend = hasBackendAccess(actor);
  const receipts = hasReceiptsAccess(actor);
  const managers = hasManagementAccess(actor);
  const visible = links
    .filter((link) => (!link.backendOnly || backend) && (!link.receiptsOnly || receipts) && (!link.managersOnly || managers))
    .map((link) => (link.href === "/chat" && unread > 0 ? { ...link, label: "Chat · new" } : link));
  return (
    <div className="lab-app">
      <LabChrome links={visible} name={actor.fullName} role={actor.jobTitle.trim() || roleLabels[actor.role] || actor.role} />
      <main className="lab-main">{children}</main>
    </div>
  );
}
