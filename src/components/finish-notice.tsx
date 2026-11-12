"use client";

import { useEffect, useRef } from "react";

export function FinishNotice({ title, message, anchor }: { title: string; message: string; anchor?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node || node.open) return;
    node.showModal();
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ block: "start" });
  }, [message, anchor]);

  return (
    <dialog ref={dialog} className="finish-notice" aria-labelledby="finish-notice-title">
      <h2 id="finish-notice-title">{title}</h2>
      <p>{message}</p>
      <form method="dialog">
        <button className="lab-btn" type="submit">OK</button>
      </form>
    </dialog>
  );
}
