"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { sendChatAction } from "@/server/actions";
import { SubmitButton } from "@/components/submit-button";

type Message = {
  id: string;
  body: string;
  created_at: string;
  sender_name: string;
  mine: boolean;
};

const initial = { error: "" };

export function ChatPanel({ messages }: { messages: Message[] }) {
  const router = useRouter();
  const bottom = useRef<HTMLDivElement>(null);
  const [state, action] = useActionState(sendChatAction, initial);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 8000);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <div className="lab-card grid gap-0 overflow-hidden">
      <div className="lab-chat-thread">
        {messages.length === 0 ? <p className="p-4 text-sm text-zinc-500">No messages yet. This thread is shared — everyone will see what you post.</p> : null}
        {messages.length > 0 ? <p className="px-1 pb-1 text-xs text-zinc-500">{messages.length} messages in team history</p> : null}
        {messages.map((message) => (
          <article key={message.id} className={message.mine ? "lab-chat-bubble is-mine" : "lab-chat-bubble"}>
            <header>
              <strong>{message.mine ? "You" : message.sender_name}</strong>
              <time dateTime={message.created_at}>{formatWhen(message.created_at)}</time>
            </header>
            <p>{message.body}</p>
          </article>
        ))}
        <div ref={bottom} />
      </div>
      <form action={action} className="lab-chat-compose">
        <label className="sr-only" htmlFor="chat-body">Message</label>
        <textarea id="chat-body" name="body" rows={2} required maxLength={2000} placeholder="Message the whole team…" />
        {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
        <SubmitButton>Send</SubmitButton>
      </form>
    </div>
  );
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
