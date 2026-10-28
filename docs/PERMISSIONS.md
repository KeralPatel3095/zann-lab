# Permissions

The signed-in user comes from the session cookie. Server actions and row-level security both check that identity. A page hiding a field is not the security boundary.

| Action | Administrator | Front desk | Technician | Department lead | Manager |
| --- | --- | --- | --- | --- | --- |
| Clinic name, email, phone, billing | Yes | Yes | No | Only if explicitly granted | Only if explicitly granted |
| Create and release cases | Yes | Yes | No | No | No |
| Change requested delivery date | Yes | Yes | No | No | Yes |
| See a case | All | All | Assigned tasks only | Tasks in led departments | All |
| Update a task | Yes | Deadlines only while scheduling | Own assigned task | Department tasks | Yes |
| Change assignment | Yes | No | No | To a member of that department | Yes |
| Record quality and rework | Yes | No | Yes, on a visible quality task | Yes | Yes |
| Dispatch | Yes | Yes | No | No | Yes |
| Import | Yes | Yes | No | No | No |
| Export clinic columns | Yes | Yes | No | No, unless clinic visibility was granted | No, unless granted |
| Staff, departments, stages, calendar, settings | Yes | No | No | No | No |
| Audit log | Yes | No | No | No | Yes |

A technician export contains the production columns: case number, dentist code, patient name, PAN, case type, dates, stage, status, and priority. It does not contain dentist name, clinic name, clinic email, or clinic phone.

Unauthorized task and case reads return no row. The application treats that as not found so a hidden record is not confirmed.

Direct updates cannot set a case to dispatched or delivered unless `dispatch_records.dispatched_at` is already stored.
