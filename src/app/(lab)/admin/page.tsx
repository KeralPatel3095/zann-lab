import { requireActorPage } from "@/lib/auth/current";
import { adminSnapshot } from "@/lib/domain/admin";
import { auditLog } from "@/lib/domain/reports";
import { roleLabels } from "@/lib/labels";
import { departmentAction, holidayAction, settingAction, staffAction, staffActiveAction, staffPasswordAction, stageAction } from "@/server/actions";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActorPage();
  const notice = (await searchParams).notice;
  const snapshot = await adminSnapshot(actor.id);
  const audit = await auditLog(actor.id);
  if (!snapshot) return <p>Administrator access is required.</p>;
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Administration</h1>
      {notice ? <p className="rounded-md bg-amber-50 p-3 text-sm">{notice}</p> : null}
      <p className="text-sm text-zinc-600">Checklist items and durations are placeholders until ZANN&apos;s technical leads approve them. Technician accounts cannot be granted clinic identity.</p>
      <section className="lab-card p-5">
        <h2 className="text-xl">Staff</h2>
        <p className="mt-1 text-sm">Give each technician their own email and password. They sign in with those, and they can change the password from the Password page.</p>
        <div className="lab-sheet mt-3">
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Clinic identity</th><th>Password</th><th>Active</th></tr></thead>
            <tbody>
              {snapshot.staff.map((person) => (
                <tr key={person.id}>
                  <td data-label="Name">{person.full_name}<br />{person.email}</td>
                  <td data-label="Role">{roleLabels[person.role]}</td>
                  <td data-label="Clinic">{person.can_view_clinic_identity ? "Authorized" : "Hidden"}</td>
                  <td data-label="Password">
                    <form action={staffPasswordAction} className="flex items-center gap-2">
                      <input type="hidden" name="user_id" value={person.id} />
                      <input className="lab-inline" name="password" type="password" placeholder="New password" minLength={10} required />
                      <button className="rounded-md border border-[#545658] bg-white px-3 py-2 text-sm text-[#545658]">Set</button>
                    </form>
                  </td>
                  <td data-label="Active">
                    <form action={staffActiveAction}>
                      <input type="hidden" name="user_id" value={person.id} />
                      <input type="hidden" name="active" value={person.active ? "false" : "true"} />
                      <button className="text-sm text-teal-800">{person.active ? "Disable" : "Enable"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={staffAction} className="mt-4 grid gap-2 md:grid-cols-2">
          <input name="full_name" placeholder="Full name" required />
          <input name="email" type="email" placeholder="Their email" required />
          <select name="role" defaultValue="technician">
            <option value="front_desk">Front desk</option>
            <option value="technician">Technician</option>
            <option value="department_lead">Department lead</option>
            <option value="production_manager">Production manager</option>
            <option value="administrator">Administrator</option>
          </select>
          <select name="department_id" defaultValue="">
            <option value="">No department</option>
            {snapshot.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
          <input name="password" type="password" placeholder="Their password, 10 characters or more" minLength={10} required />
          <label className="flex items-center gap-2"><input className="h-4 w-4" type="checkbox" name="clinic" />Authorize clinic identity</label>
          <button className="rounded-md bg-teal-800 px-3 py-2 text-sm text-white">Create account</button>
        </form>
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Departments</h2>
        <ul className="text-sm">{snapshot.departments.map((department) => <li key={department.id}>{department.name}{department.active ? "" : " (inactive)"}</li>)}</ul>
        <form action={departmentAction} className="mt-3 grid gap-2 md:grid-cols-2">
          <input name="name" placeholder="Department name" required />
          <input name="description" placeholder="Description" />
          <label className="flex items-center gap-2"><input className="h-4 w-4" type="checkbox" name="active" defaultChecked />Active</label>
          <button className="rounded-md border px-3 py-2 text-sm">Add department</button>
        </form>
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Workflow stages</h2>
        <div className="grid gap-3">
          {snapshot.stages.map((stage) => (
            <form key={stage.id} action={stageAction} className="grid gap-2 border-b border-zinc-100 py-2 md:grid-cols-5">
              <input type="hidden" name="stage_id" value={stage.id} />
              <p className="text-sm md:col-span-5">{stage.template_name}: {stage.stage_name}</p>
              <label>Work minutes<input name="work_minutes" type="number" defaultValue={stage.estimated_work_minutes} /></label>
              <label>Elapsed minutes<input name="elapsed_minutes" type="number" defaultValue={stage.elapsed_minutes} /></label>
              <label className="flex items-center gap-2"><input className="h-4 w-4" type="checkbox" name="skippable" defaultChecked={stage.skippable} />Skippable</label>
              <label className="flex items-center gap-2"><input className="h-4 w-4" type="checkbox" name="active" defaultChecked={stage.active} />Active</label>
              <button className="rounded-md border px-3 py-2 text-sm">Save stage</button>
            </form>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Settings and calendar</h2>
        {snapshot.settings.filter((item) => ["reminder_local_time", "dispatch_buffer_minutes", "email_notifications_enabled", "email_include_patient_details"].includes(item.setting_key)).map((item) => (
          <form key={item.setting_key} action={settingAction} className="mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="key" value={item.setting_key} />
            <label className="flex-1">{item.setting_key}<input name="value" defaultValue={item.setting_value} /></label>
            <button className="self-end rounded-md border px-3 py-2 text-sm">Save</button>
          </form>
        ))}
        <form action={holidayAction} className="mt-4 grid gap-2 md:grid-cols-4">
          <input type="date" name="date" required />
          <input name="description" placeholder="Description" />
          <label className="flex items-center gap-2"><input className="h-4 w-4" type="checkbox" name="working" />Working day</label>
          <button className="rounded-md border px-3 py-2 text-sm">Save calendar day</button>
        </form>
        <ul className="mt-3 text-sm">{snapshot.holidays.map((day) => <li key={day.calendar_date}>{day.calendar_date}: {day.description} ({day.is_working_day ? "working" : "closed"})</li>)}</ul>
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Audit log</h2>
        <ul className="mt-2 text-sm">{audit.slice(0, 30).map((event) => <li key={event.id}>{event.created_at.toISOString()} · {event.action} · {event.entity_type} · {event.actor_name ?? "System"}</li>)}</ul>
      </section>
    </div>
  );
}
