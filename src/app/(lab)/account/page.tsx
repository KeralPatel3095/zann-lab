import { requireActorPage } from "@/lib/auth/current";
import { roleLabels } from "@/lib/labels";
import { ownPasswordAction } from "@/server/actions";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActorPage();
  const notice = (await searchParams).notice;
  return (
    <div className="grid max-w-lg gap-4">
      <header>
        <p className="lab-kicker">Your account</p>
        <h1 className="mt-1 text-3xl">Password</h1>
        <p className="mt-1 text-sm">{actor.fullName} · {roleLabels[actor.role]}</p>
      </header>
      {notice ? <p className="lab-card p-3 text-sm text-[#545658]">{notice}</p> : null}
      <form action={ownPasswordAction} className="lab-card grid gap-3 p-5">
        <p className="text-sm">Set a password only you use. It must be at least 10 characters.</p>
        <label>Current password<input name="current_password" type="password" autoComplete="current-password" required /></label>
        <label>New password<input name="next_password" type="password" autoComplete="new-password" minLength={10} required /></label>
        <label>Confirm new password<input name="confirm_password" type="password" autoComplete="new-password" minLength={10} required /></label>
        <button className="w-fit rounded-md border border-[#545658] bg-white px-4 py-2 text-sm text-[#545658]">Save password</button>
      </form>
    </div>
  );
}
