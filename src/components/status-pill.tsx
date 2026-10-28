import { caseStatusLabels, indicatorLabels, label, sheetStatus, taskStatusLabels } from "@/lib/labels";

const tones: Record<string, string> = {
  on_track: "bg-[#e2f2f6] text-[#3d6d7a] border-[#b8dce8]",
  completed: "bg-[#e2f2f6] text-[#3d6d7a] border-[#b8dce8]",
  delivered: "bg-[#e2f2f6] text-[#3d6d7a] border-[#b8dce8]",
  dispatched: "bg-[#e2f2f6] text-[#3d6d7a] border-[#b8dce8]",
  due_soon: "bg-[#f8f1e6] text-[#8a5a2a] border-[#ead7b8]",
  at_risk: "bg-[#f8f1e6] text-[#8a5a2a] border-[#ead7b8]",
  awaiting_approval: "bg-[#f8f1e6] text-[#8a5a2a] border-[#ead7b8]",
  overdue: "bg-[#fdecea] text-[#9b3a32] border-[#f0c9c4]",
  blocked: "bg-[#fdecea] text-[#9b3a32] border-[#f0c9c4]",
  rush: "bg-[#fdecea] text-[#9b3a32] border-[#f0c9c4]",
  in_progress: "bg-[#eef7f4] text-[#2f6b62] border-[#c9e4dc]",
  ready_to_start: "bg-[#eef7f4] text-[#2f6b62] border-[#c9e4dc]",
  in_production: "bg-[#eef7f4] text-[#2f6b62] border-[#c9e4dc]",
  ready_for_production: "bg-[#eef7f4] text-[#2f6b62] border-[#c9e4dc]",
  ready_for_dispatch: "bg-[#e2f2f6] text-[#3d6d7a] border-[#b8dce8]",
  waiting: "bg-[#f4f4f4] text-[#636466] border-[#e4e4e4]",
  draft: "bg-[#f4f4f4] text-[#636466] border-[#e4e4e4]",
  paused: "bg-[#f4f4f4] text-[#636466] border-[#e4e4e4]",
  on_hold: "bg-[#f4f4f4] text-[#636466] border-[#e4e4e4]",
};

export function StatusPill({ value, kind = "case", trackerStatus = "" }: { value: string; kind?: "case" | "task" | "indicator"; trackerStatus?: string }) {
  const shown = kind === "case" ? sheetStatus(trackerStatus, value) : null;
  const tone = shown?.tone ?? value;
  const map = kind === "task" ? taskStatusLabels : kind === "indicator" ? indicatorLabels : caseStatusLabels;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone] ?? "bg-[#f4f4f4] text-[#636466] border-[#e4e4e4]"}`}>
      {shown?.text ?? label(map, value)}
    </span>
  );
}
