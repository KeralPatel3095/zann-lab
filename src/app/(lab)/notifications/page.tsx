import { requireActorPage } from "@/lib/auth/current";
import { formatStamp } from "@/lib/format";
import { listNotifications } from "@/lib/domain/reports";
import { readNotificationAction } from "@/server/actions";

export default async function NotificationsPage() {
  const actor = await requireActorPage();
  const notes = await listNotifications(actor.id);
  return (
    <div className="grid gap-3">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      {notes.map((note) => (
        <article key={note.id} className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">{note.title}</h2>
            <span className="text-xs text-zinc-500">{formatStamp(note.created_at)}</span>
          </div>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{note.body}</pre>
          {note.read_at ? <p className="mt-2 text-xs text-zinc-500">Read</p> : (
            <form action={readNotificationAction} className="mt-2">
              <input type="hidden" name="notification_id" value={note.id} />
              <button className="text-sm text-teal-800">Mark read</button>
            </form>
          )}
        </article>
      ))}
      {notes.length === 0 ? <p className="text-sm text-zinc-500">No notifications yet. Assigned work remains on My Tasks even if email is unavailable.</p> : null}
    </div>
  );
}
