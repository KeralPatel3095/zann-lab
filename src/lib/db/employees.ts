import { hashPassword } from "../auth/password";
import type { StaffRole } from "../privacy";
import { ownerEmailForCaseType, technicianDepartments } from "../product-routing";
import { getSql } from "./sql";

/** Lab staff sign-ins. Password is the full Name@month token. */
export const labEmployees = [
  { fullName: "Keral Patel", email: "keral.patel@zann-lab.test", password: "KeralPatel@sept", role: "administrator" as StaffRole, title: "Administrator" },
  { fullName: "Ana Bogdanovic", email: "ana.bogdanovic@zann-lab.test", password: "AnaBogdanovic@nov", role: "administrator" as StaffRole, title: "CEO" },
  { fullName: "Ned Bogdanovic", email: "ned.bogdanovic@zann-lab.test", password: "NedBogdanovic@nov", role: "technician" as StaffRole, title: "Technician" },
  { fullName: "Zoca Bogdanovic", email: "zoca.bogdanovic@zann-lab.test", password: "ZocaBogdanovic@nov", role: "technician" as StaffRole, title: "Technician" },
  { fullName: "Parneet Kaur", email: "parneet.kaur@zann-lab.test", password: "ParneetKaur@sept", role: "administrator" as StaffRole, title: "Administrator" },
  { fullName: "Negar Ghasemi", email: "negar.qureshi@zann-lab.test", password: "Negarqureshi@sept", role: "technician" as StaffRole, title: "Technician" },
] as const;

export async function seedLabEmployees() {
  const sql = await getSql();
  await sql.begin(async (tx) => {
    const [admin] = await tx<{ id: string }[]>`
      select id from profiles
      where role in ('administrator'::app_role, 'backend'::app_role) and active
      limit 1
    `;
    if (admin) {
      await tx`select set_config('app.user_id', ${admin.id}, true)`;
    }

    const departments = await tx<{ id: string; name: string }[]>`select id, name from departments`;
    const departmentId = (name: string) => departments.find((row) => row.name === name)?.id;

    for (const person of labEmployees) {
      const hash = await hashPassword(person.password);
      const clinic = person.role !== "technician";
      const [existing] = await tx<{ id: string }[]>`
        select id from profiles where email = ${person.email}
      `;
      let userId = existing?.id ?? "";
      if (existing) {
        await tx`
          insert into local_credentials (user_id, password_hash)
          values (${existing.id}, ${hash})
          on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now()
        `;
        await tx`
          update profiles
          set full_name = ${person.fullName},
              role = ${person.role}::app_role,
              job_title = ${person.title},
              active = true,
              can_view_clinic_identity = ${clinic}
          where id = ${existing.id}
        `;
      } else {
        const [created] = await tx<{ id: string }[]>`
          insert into profiles (full_name, email, role, job_title, can_view_clinic_identity)
          values (${person.fullName}, ${person.email}, ${person.role}::app_role, ${person.title}, ${clinic})
          returning id
        `;
        userId = created.id;
        await tx`insert into local_credentials (user_id, password_hash) values (${created.id}, ${hash})`;
        if (!admin && (person.role === "administrator" || person.role === "backend")) {
          await tx`select set_config('app.user_id', ${created.id}, true)`;
        }
      }

      const homeDepartment = technicianDepartments[person.email];
      const deptId = homeDepartment ? departmentId(homeDepartment) : undefined;
      if (deptId && userId) {
        await tx`
          insert into department_members (department_id, user_id, membership_role, active)
          values (${deptId}, ${userId}, 'member'::membership_role, true)
          on conflict (department_id, user_id) do update set active = true
        `;
      }
    }

    // Route open production tasks to the product owner when the case type matches.
    const open = await tx<{ id: string; case_type: string }[]>`
      select t.id, c.case_type
      from production_tasks t
      join cases c on c.id = t.case_id
      where t.task_status not in ('completed', 'cancelled')
    `;
    const techs = await tx<{ id: string; email: string }[]>`
      select id, email from profiles where role = 'technician' and active
    `;
    const byEmail = new Map(techs.map((row) => [row.email.toLowerCase(), row.id]));
    for (const task of open) {
      const email = ownerEmailForCaseType(task.case_type);
      const assignee = email ? byEmail.get(email) : null;
      if (!assignee) continue;
      await tx`update production_tasks set assigned_user_id = ${assignee} where id = ${task.id}`;
    }
  });
}
