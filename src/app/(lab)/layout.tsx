import { Shell } from "@/components/shell";
import { requireActorPage } from "@/lib/auth/current";
import { syncTrackerIfStale } from "@/lib/domain/tracker-sync";

export default async function LabLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActorPage();
  syncTrackerIfStale();
  return <Shell actor={actor}>{children}</Shell>;
}
