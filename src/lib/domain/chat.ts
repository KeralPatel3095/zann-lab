import { fail, runAs, type ActionResult } from "./common";

export type ChatMessage = {
  id: string;
  body: string;
  created_at: Date;
  sender_user_id: string;
  sender_name: string;
  mine: boolean;
};

export async function listChatMessages(userId: string, limit = 500) {
  return runAs(userId, async (tx, actor) => {
    const rows = await tx<{
      id: string;
      body: string;
      created_at: Date;
      sender_user_id: string;
      sender_name: string;
    }[]>`
      select id, body, created_at, sender_user_id, sender_name
      from app.list_team_chat(${limit})
    `;
    return rows.map((row) => ({
      ...row,
      mine: row.sender_user_id === actor.id,
    }));
  });
}

export async function sendChatMessage(userId: string, body: string): Promise<ActionResult> {
  try {
    const cleaned = body.trim();
    if (!cleaned) return { ok: false, message: "Enter a message." };
    if (cleaned.length > 2000) return { ok: false, message: "Keep messages under 2000 characters." };
    await runAs(userId, async (tx) => {
      await tx`select app.send_team_chat(${cleaned})`;
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Enter a message")) return { ok: false, message: "Enter a message up to 2000 characters." };
    return fail(error);
  }
}

export async function unreadChatCount(userId: string) {
  return runAs(userId, async (tx) => {
    const [row] = await tx<{ total: number }[]>`
      select case when count(*) > 0 then 1 else 0 end::int as total
      from notifications
      where recipient_user_id = ${userId}
        and notification_type = 'chat_message'
        and read_at is null
    `;
    return row?.total ?? 0;
  });
}

export async function markChatNotificationsRead(userId: string) {
  await runAs(userId, async (tx) => {
    await tx`
      update notifications
      set read_at = coalesce(read_at, now())
      where recipient_user_id = ${userId}
        and notification_type = 'chat_message'
        and read_at is null
    `;
  });
}
