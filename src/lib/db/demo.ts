import { hashPassword } from "../auth/password";
import { createStaff } from "../domain/admin";
import { getSql } from "./sql";

export async function seedDemo() {
  if (process.env.SEED_DEMO === "false") return;
  const password = process.env.SEED_PASSWORD;
  if (!password) return;
  const sql = await getSql();
  const [existing] = await sql<{ id: string }[]>`select id from profiles where email = 'avery.chen@zann-lab.test'`;
  if (existing) return;
  const hash = await hashPassword(password);
  const [admin] = await sql<{ id: string }[]>`
    insert into profiles (full_name, email, role, can_view_clinic_identity)
    values ('Avery Chen', 'avery.chen@zann-lab.test', 'administrator', true)
    returning id
  `;
  await sql`insert into local_credentials (user_id, password_hash) values (${admin.id}, ${hash})`;
  const departments = await sql<{ id: string; name: string }[]>`select id, name from departments`;
  const department = (name: string) => departments.find((item) => item.name === name)?.id;
  const staff = [
    ["Morgan Ellis", "morgan.ellis@zann-lab.test", "front_desk", "", false],
    ["Riley Shah", "riley.shah@zann-lab.test", "technician", "Digital Design and CAD/CAM", false],
    ["Samir Patel", "samir.patel@zann-lab.test", "technician", "Crowns and Bridges", false],
    ["Noor Adel", "noor.adel@zann-lab.test", "technician", "Nightguards and Sports Guards", false],
    ["Jordan Blake", "jordan.blake@zann-lab.test", "technician", "Finishing and Quality Control", false],
    ["Quinn Harper", "quinn.harper@zann-lab.test", "department_lead", "Crowns and Bridges", true],
    ["Taylor Nguyen", "taylor.nguyen@zann-lab.test", "production_manager", "", false],
  ] as const;
  for (const [fullName, email, role, departmentName, lead] of staff) {
    await createStaff(admin.id, {
      fullName,
      email,
      role,
      password,
      departmentId: departmentName ? department(departmentName) : undefined,
      lead,
      canViewClinicIdentity: false,
    });
  }
  const denture = department("Dentures, Partials, and Repairs");
  if (denture) {
    await createStaff(admin.id, {
      fullName: "Elena Vos",
      email: "elena.vos@zann-lab.test",
      role: "technician",
      password,
      departmentId: denture,
      canViewClinicIdentity: false,
    });
  }
}
