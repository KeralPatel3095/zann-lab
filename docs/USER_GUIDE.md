# User guide

Sign in with the email on your account. The session ends when you sign out. Disabled accounts cannot sign in.

## Front desk

Open **New case**. Enter the dentist code, patient, PAN, prescription, at least one tooth or unit, the received time, and the requested delivery time. Clinic name and contact fields are visible here and stay hidden from technicians.

Save a draft or place the case on hold when information is missing. Those cases do not create technician tasks. **Release to production** checks the required fields and builds the workflow. If the delivery date does not leave enough working time, read the warning. Acknowledging it releases the case and keeps the risk flag. It does not change the dentist's date.

The case page shows the timeline, units, and, for authorized staff, the clinic account. Use it to record missing information, hold or resume the case, change the requested delivery date, and record courier dispatch. Dispatch is a separate action from finishing a task. Delivered is available after dispatch.

**Cases** searches by case number, PAN, dentist code, and patient name. **Today** counts active, due, blocked, and ready-to-dispatch work from the database. **Import** and the export link on Cases follow the same permissions as the screen.

## Technicians

**My tasks** groups work by due date and status. Open a task to start, pause, resume, complete, or mark it blocked. Pause and block need a reason. Block also needs a category. Complete is accepted after the required checklist items are checked. A quality-control task uses the quality result buttons instead of complete.

You can see the dentist code, patient, PAN, case number, tooth or unit details, material, shade, and technical instructions. You cannot see the dentist's real name, the clinic name, or clinic contact details. Search does not offer those fields.

A reminder titled **Upcoming Production Task** arrives on the previous working day. Assigned work stays on My tasks if email is unavailable.

## Department leads

**Department** lists open tasks in the departments you lead. Assign a task to a technician who belongs to that department. Clinic details stay hidden unless an administrator explicitly grants them.

## Managers

**Management** shows workload minutes, open tasks, on-time dispatch, turnaround by case type, bottlenecks, quality failures, and rework. A completed task, a finished case, and a dispatched case are separate counts. Minutes are shown beside task counts because a case count is not a productivity score.

## Administrators

**Admin** creates staff, disables accounts, adds departments, edits stage minutes, sets the reminder clock, and edits calendar days. Grant clinic identity only to leads or managers who need it. Technician accounts cannot receive that grant. The audit list records privileged status and assignment changes. It does not store patient names in the audit metadata.

Before go-live, replace the placeholder workflows with the routes confirmed by each department lead, turn off demo seeding, and remove the fictional accounts.
