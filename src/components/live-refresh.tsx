"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Reload server data so a Google Sheet change shows up without a manual refresh. */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      router.refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
