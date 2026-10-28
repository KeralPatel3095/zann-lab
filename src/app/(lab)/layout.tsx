import { Shell } from "@/components/shell";
import { requireActorPage } from "@/lib/auth/current";

export default async function LabLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActorPage();
  return <Shell actor={actor}>{children}</Shell>;
}
