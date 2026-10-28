import { DateTime } from "luxon";
import {
  addWorkingMinutes,
  alignToWorkingInstant,
  type LabCalendar,
  laborMinutesByDate,
  moveToWorkingStart,
  subtractWorkingMinutes,
  workingMinutesBetween,
} from "./calendar";

export type StageNode = {
  id: string;
  name: string;
  workMinutes: number;
  elapsedMinutes: number;
  departmentId: string;
  predecessors: string[];
};

export type ScheduledStage = StageNode & {
  plannedStart: DateTime;
  laborDue: DateTime;
  plannedDue: DateTime;
};

export type ScheduleResult = {
  stages: ScheduledStage[];
  feasible: boolean;
  reasons: string[];
};

function topological(stages: StageNode[]) {
  const incoming = new Map(stages.map((stage) => [stage.id, 0]));
  for (const stage of stages) {
    for (const predecessor of stage.predecessors) {
      if (!incoming.has(predecessor)) throw new Error("Workflow dependency is missing a stage");
      incoming.set(stage.id, (incoming.get(stage.id) ?? 0) + 1);
    }
  }
  const queue = stages.filter((stage) => incoming.get(stage.id) === 0);
  const ordered: StageNode[] = [];
  while (queue.length > 0) {
    const stage = queue.shift();
    if (!stage) break;
    ordered.push(stage);
    for (const next of stages) {
      if (!next.predecessors.includes(stage.id)) continue;
      const value = (incoming.get(next.id) ?? 1) - 1;
      incoming.set(next.id, value);
      if (value === 0) queue.push(next);
    }
  }
  if (ordered.length !== stages.length) throw new Error("Workflow stages contain a cycle");
  return ordered;
}

function placeBackward(stage: StageNode, finish: DateTime, calendar: LabCalendar) {
  const laborDue = stage.elapsedMinutes > 0 ? finish.minus({ minutes: stage.elapsedMinutes }) : finish;
  const plannedStart = stage.workMinutes > 0 ? subtractWorkingMinutes(laborDue, stage.workMinutes, calendar) : laborDue;
  return { plannedStart, laborDue, plannedDue: finish };
}

export function scheduleBackward(
  stages: StageNode[],
  delivery: DateTime,
  readyAt: DateTime,
  calendar: LabCalendar,
  bufferMinutes = 0,
): ScheduleResult {
  const reasons: string[] = [];
  if (stages.length === 0) return { stages: [], feasible: false, reasons: ["The workflow has no stages."] };
  let ordered: StageNode[];
  try {
    ordered = topological(stages);
  } catch (error) {
    return { stages: [], feasible: false, reasons: [error instanceof Error ? error.message : "The workflow could not be scheduled."] };
  }
  const placed = new Map<string, { plannedStart: DateTime; laborDue: DateTime; plannedDue: DateTime }>();
  try {
    const alignedDelivery = alignToWorkingInstant(delivery, calendar);
    const latestFinish = bufferMinutes > 0 ? subtractWorkingMinutes(alignedDelivery, bufferMinutes, calendar) : alignedDelivery;
    for (const stage of [...ordered].reverse()) {
      const successors = stages.filter((item) => item.predecessors.includes(stage.id));
      const finish = successors.length
        ? successors.map((item) => placed.get(item.id)?.plannedStart).reduce((earliest, value) => {
            if (!value) return earliest;
            if (!earliest || value < earliest) return value;
            return earliest;
          }, undefined as DateTime | undefined) ?? latestFinish
        : latestFinish;
      placed.set(stage.id, placeBackward(stage, finish, calendar));
    }
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : "The working calendar could not fit this case.");
    return { stages: [], feasible: false, reasons };
  }
  const ready = readyAt.setZone(calendar.zone);
  const scheduled = ordered.map((stage) => {
    const timing = placed.get(stage.id);
    if (!timing) throw new Error("Stage was not scheduled");
    if (timing.plannedStart < ready) {
      reasons.push(
        `${stage.name} would need to start ${timing.plannedStart.setZone(calendar.zone).toFormat("ccc d LLL, t")}, which is before the case is ready.`,
      );
    }
    return { ...stage, ...timing };
  });
  return { stages: scheduled, feasible: reasons.length === 0, reasons };
}

export function scheduleForward(stages: StageNode[], earliest: DateTime, calendar: LabCalendar): ScheduleResult {
  const reasons: string[] = [];
  let ordered: StageNode[];
  try {
    ordered = topological(stages);
  } catch (error) {
    return { stages: [], feasible: false, reasons: [error instanceof Error ? error.message : "The workflow could not be scheduled."] };
  }
  const placed = new Map<string, { plannedStart: DateTime; laborDue: DateTime; plannedDue: DateTime }>();
  try {
    for (const stage of ordered) {
      const predecessorFinish = stage.predecessors.map((id) => placed.get(id)?.plannedDue).filter((value): value is DateTime => Boolean(value));
      const notBefore = predecessorFinish.reduce((latest, value) => (value > latest ? value : latest), earliest);
      const plannedStart = stage.workMinutes > 0 ? moveToWorkingStart(notBefore, calendar) : notBefore;
      const laborDue = stage.workMinutes > 0 ? addWorkingMinutes(plannedStart, stage.workMinutes, calendar) : plannedStart;
      const plannedDue = stage.elapsedMinutes > 0 ? laborDue.plus({ minutes: stage.elapsedMinutes }) : laborDue;
      placed.set(stage.id, { plannedStart, laborDue, plannedDue });
    }
  } catch (error) {
    return { stages: [], feasible: false, reasons: [error instanceof Error ? error.message : "The working calendar could not fit this case."] };
  }
  return {
    stages: ordered.map((stage) => ({ ...stage, ...placed.get(stage.id)! })),
    feasible: true,
    reasons,
  };
}

export type TechnicianLoad = {
  id: string;
  departmentIds: string[];
  capacityMinutes: number;
  commitments: { start: DateTime; end: DateTime; minutesByDate: Map<string, number> }[];
};

export function assignTechnicians(
  tasks: { id: string; name: string; departmentId: string; plannedStart: DateTime; laborDue: DateTime; workMinutes: number }[],
  technicians: { id: string; departmentIds: string[]; capacityMinutes: number; commitments: { start: DateTime; end: DateTime }[] }[],
  calendar: LabCalendar,
) {
  const loads: TechnicianLoad[] = technicians.map((technician) => ({
    ...technician,
    commitments: technician.commitments.map((commitment) => ({
      ...commitment,
      minutesByDate: laborMinutesByDate(
        commitment.start,
        workingMinutesBetween(commitment.start, commitment.end, calendar),
        calendar,
      ),
    })),
  }));
  const assignments: Record<string, string | null> = {};
  const conflicts: string[] = [];
  const ordered = [...tasks].sort((a, b) => a.plannedStart.toMillis() - b.plannedStart.toMillis());
  for (const task of ordered) {
    const portion = laborMinutesByDate(task.plannedStart, task.workMinutes, calendar);
    const candidates = loads.filter((technician) => technician.departmentIds.includes(task.departmentId));
    const available = candidates.filter((technician) => {
      const overlaps = technician.commitments.some((commitment) => task.plannedStart < commitment.end && commitment.start < task.laborDue);
      if (overlaps) return false;
      for (const [date, minutes] of portion) {
        const used = technician.commitments.reduce((sum, commitment) => sum + (commitment.minutesByDate.get(date) ?? 0), 0);
        if (used + minutes > technician.capacityMinutes) return false;
      }
      return true;
    });
    available.sort((a, b) => {
      const load = (technician: TechnicianLoad) => technician.commitments.reduce((sum, commitment) => {
        let inner = 0;
        for (const value of commitment.minutesByDate.values()) inner += value;
        return sum + inner;
      }, 0);
      return load(a) - load(b);
    });
    const chosen = available[0];
    if (!chosen) {
      assignments[task.id] = null;
      conflicts.push(`No technician has capacity for ${task.name} without overlapping work.`);
      continue;
    }
    chosen.commitments.push({ start: task.plannedStart, end: task.laborDue, minutesByDate: portion });
    assignments[task.id] = chosen.id;
  }
  return { assignments, conflicts };
}

export function bridgeIncludedStages(stages: StageNode[], includedIds: Set<string>) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  return stages.filter((stage) => includedIds.has(stage.id)).map((stage) => {
    const predecessors: string[] = [];
    const stack = [...stage.predecessors];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (includedIds.has(id)) predecessors.push(id);
      else stack.push(...(byId.get(id)?.predecessors ?? []));
    }
    return { ...stage, predecessors: [...new Set(predecessors)] };
  });
}
