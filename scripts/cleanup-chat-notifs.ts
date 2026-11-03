import { loadEnvFiles } from "../src/lib/env";

async function main() {
  loadEnvFiles();
  const { getSql, closeSql } = await import("../src/lib/db/sql");
  const sql = await getSql();

  await sql`
    with ranked as (
      select id,
             row_number() over (partition by recipient_user_id order by created_at desc, id desc) as rank
      from notifications
      where notification_type = 'chat_message'
    ),
    doomed as (
      select id from ranked where rank > 1
    )
    delete from notification_deliveries d
    using doomed x
    where d.notification_id = x.id
  `;

  await sql`
    with ranked as (
      select id,
             row_number() over (partition by recipient_user_id order by created_at desc, id desc) as rank
      from notifications
      where notification_type = 'chat_message'
    ),
    doomed as (
      select id from ranked where rank > 1
    )
    delete from notification_keys k
    using doomed x
    where k.notification_id = x.id
  `;

  const deleted = await sql`
    with ranked as (
      select id,
             row_number() over (partition by recipient_user_id order by created_at desc, id desc) as rank
      from notifications
      where notification_type = 'chat_message'
    )
    delete from notifications n
    using ranked r
    where n.id = r.id
      and r.rank > 1
    returning n.id
  `;

  const [row] = await sql<{ chat: number; people: number }[]>`
    select count(*)::int as chat,
           count(distinct recipient_user_id)::int as people
    from notifications
    where notification_type = 'chat_message'
  `;
  console.log(`removed=${deleted.length} remaining_chat=${row?.chat ?? 0} people=${row?.people ?? 0}`);
  await closeSql();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
