"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, tone = "primary" }: { children: React.ReactNode; tone?: "primary" | "ghost" | "danger" }) {
  const { pending } = useFormStatus();
  const tones = {
    primary: "border border-[#545658] bg-white text-[#545658] hover:bg-[#545658] hover:text-white",
    ghost: "border border-[#545658] bg-white text-[#545658] hover:bg-[#545658] hover:text-white",
    danger: "border border-[#9b3a32] bg-white text-[#9b3a32] hover:bg-[#9b3a32] hover:text-white",
  };
  return (
    <button type="submit" disabled={pending} className={`w-fit rounded-md px-5 py-2.5 text-sm transition disabled:opacity-60 ${tones[tone]}`}>
      {pending ? "Saving..." : children}
    </button>
  );
}
