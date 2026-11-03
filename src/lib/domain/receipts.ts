import { DateTime } from "luxon";
import { LAB_ZONE } from "../scheduling/calendar";
import { hasReceiptsAccess, runAs } from "./common";

export type DaySendCount = {
  day: string;
  total: number;
};

/** Daily send counts from sheet due dates — numbers only. */
export async function sendingVolumeReport(userId: string, day?: string) {
  return runAs(userId, async (tx, actor) => {
    if (!hasReceiptsAccess(actor)) return null;
    const zone = LAB_ZONE;
    const selected = DateTime.fromISO(day || "", { zone: LAB_ZONE });
    const focus = selected.isValid ? selected.startOf("day") : DateTime.now().setZone(LAB_ZONE).startOf("day");
    const focusIso = focus.toISODate() ?? "";
    const rangeStart = focus.minus({ days: 30 }).toISODate() ?? focusIso;

    const [today] = await tx<{ total: number }[]>`
      select count(*)::int as total
      from cases
      where requested_delivery_at is not null
        and (requested_delivery_at at time zone ${zone})::date = ${focusIso}::date
    `;

    const daily = await tx<DaySendCount[]>`
      select to_char((requested_delivery_at at time zone ${zone})::date, 'YYYY-MM-DD') as day,
             count(*)::int as total
      from cases
      where requested_delivery_at is not null
        and (requested_delivery_at at time zone ${zone})::date between ${rangeStart}::date and ${focusIso}::date
      group by 1
      order by 1 desc
    `;

    return {
      day: focusIso,
      dayLabel: focus.toFormat("cccc d LLLL yyyy"),
      todayCount: today?.total ?? 0,
      daily,
    };
  });
}
