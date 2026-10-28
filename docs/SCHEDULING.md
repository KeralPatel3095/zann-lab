# Scheduling

When a case is released, the server loads the active stages for its workflow, drops stages the front desk excluded when the stage is skippable or not required, and keeps the dependency links across a skipped stage.

It schedules backward from the dentist's requested delivery date:

1. Align the delivery to working time and reserve any configured dispatch buffer.
2. Place each stage before its successors.
3. Subtract estimated working minutes inside department hours.
4. Add elapsed minutes on the clock for material processing, including time outside the shift.
5. Compare the first start with the current time.
6. Assign a technician in the stage's department who is under the daily minute capacity and is not already booked on an overlapping interval.
7. Save the plan, set the deadline indicator, and notify assignees.

If the requested date cannot fit the remaining work, release stops and shows the reason. The requested date is not changed. An authorized user can release anyway by acknowledging the warning. The case stays marked at risk.

After work has started, rescheduling keeps a just-in-time plan when the remaining stages still fit before the delivery date. If they do not, the open tasks are placed forward from the current time and conflicts are recorded. A technician who would overlap is left unassigned rather than double-booked.

Completing a task releases a successor only after every predecessor is complete. A quality gate is not completed by the normal complete button. An approved quality check releases the next task. A rejection or rework creates a rework task and returns the quality task to waiting.

## Reminders

A task due on a working day is reminded on the previous working day, at `reminder_local_time` (default 08:00). A Wednesday deadline is reminded on Tuesday. If Tuesday is closed, the reminder moves to the previous open day. Running the job twice uses `notification_keys` so the same reminder is not inserted again.

The indicator is `on_track`, `due_soon`, `at_risk`, or `overdue`. A future final deadline is not enough to mark a case on track when the remaining work no longer fits.

## Configurable values

Administrators can change stage minutes, elapsed processing, skippable and active flags, the reminder time, the dispatch buffer, email switches, business hours through the database, and individual holiday dates in Admin. New departments can be added without a code change. The seeded routes are starting templates.
