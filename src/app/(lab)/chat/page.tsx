import { ChatPanel } from "./chat-panel";
import { requireActorPage } from "@/lib/auth/current";
import { listChatMessages, markChatNotificationsRead } from "@/lib/domain/chat";

export default async function ChatPage() {
  const actor = await requireActorPage();
  const [messages] = await Promise.all([listChatMessages(actor.id), markChatNotificationsRead(actor.id)]);
  return (
    <div className="grid gap-4">
      <header>
        <p className="lab-kicker">Team</p>
        <h1 className="mt-1 text-3xl">Chat</h1>
        <p className="mt-1 text-sm">Shared history for the whole lab — open chat to see every message before you reply. New messages also appear under Notifications.</p>
      </header>
      <ChatPanel
        messages={messages.map((row) => ({
          id: row.id,
          body: row.body,
          created_at: row.created_at.toISOString(),
          sender_name: row.sender_name,
          mine: row.mine,
        }))}
      />
    </div>
  );
}
