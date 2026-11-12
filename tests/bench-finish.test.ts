import { DateTime } from "luxon";
import { beforeAll, describe, expect, it } from "vitest";
import { canMarkBenchFinish, canSeeFinishedBoard, canSeeProductionReport, caseIsNegarProduct, safeReturnPath } from "../src/lib/bench-board";
import { getSql } from "../src/lib/db/sql";
import { finishBenchCase, listFinishedBoard, listMyFinishesToday, productionReport, undoBenchFinish } from "../src/lib/domain/bench-finish";
import { listFinishToday } from "../src/lib/domain/reports";
import { PRODUCT_OWNERS } from "../src/lib/product-routing";
import { LAB_ZONE } from "../src/lib/scheduling/calendar";

describe("bench finish access", () => {
  it("lets only Negar finish, and only her products", () => {
    expect(canMarkBenchFinish({ email: PRODUCT_OWNERS.negar })).toBe(true);
    expect(canMarkBenchFinish({ email: PRODUCT_OWNERS.zoca })).toBe(false);
    expect(canMarkBenchFinish({ email: "ana.bogdanovic@zann-lab.test" })).toBe(false);
    expect(caseIsNegarProduct("Nightguard")).toBe(true);
    expect(caseIsNegarProduct("Sports Mouthguards")).toBe(true);
    expect(caseIsNegarProduct("Crown")).toBe(false);
    expect(caseIsNegarProduct("Denture")).toBe(false);
    expect(caseIsNegarProduct("")).toBe(false);
  });

  it("gives the finished board and the daily report to Ana, Keral, and Parneet", () => {
    for (const email of ["ana.bogdanovic@zann-lab.test", "keral.patel@zann-lab.test", "parneet.kaur@zann-lab.test"]) {
      expect(canSeeFinishedBoard({ email })).toBe(true);
      expect(canSeeProductionReport({ email })).toBe(true);
    }
    expect(canSeeFinishedBoard({ email: PRODUCT_OWNERS.negar })).toBe(false);
    expect(canSeeFinishedBoard({ email: PRODUCT_OWNERS.ned })).toBe(false);
    expect(canSeeProductionReport({ email: PRODUCT_OWNERS.zoca })).toBe(false);
  });

  it("keeps return paths inside the app", () => {
    expect(safeReturnPath("/due/week", "/")).toBe("/due/week");
    expect(safeReturnPath("https://evil.example", "/")).toBe("/");
    expect(safeReturnPath("//evil.example", "/")).toBe("/");
  });
});

describe("bench finish records", () => {
  let negar = "";
  let zoca = "";
  let ana = "";
  let nightguard = "";
  let crown = "";

  beforeAll(async () => {
    const sql = await getSql();
    negar = await person(PRODUCT_OWNERS.negar, "Negar Qureshi", "technician");
    zoca = await person(PRODUCT_OWNERS.zoca, "Zoca Bogdanovic", "technician");
    ana = await person("ana.bogdanovic@zann-lab.test", "Ana Bogdanovic", "administrator");
    const due = DateTime.now().setZone(LAB_ZONE).plus({ days: 1 }).toUTC().toISO();
    nightguard = await insertCase(`NG-${Date.now()}`, "Nightguard", due);
    crown = await insertCase(`CR-${Date.now()}`, "Crown", due);
    await sql`select 1`;
  });

  it("records Negar's nightguard once and keeps a crown off her count", async () => {
    const finished = await finishBenchCase(negar, nightguard);
    expect(finished.ok).toBe(true);
    const again = await finishBenchCase(negar, nightguard);
    expect(again.ok).toBe(false);
    const wrongBench = await finishBenchCase(negar, crown);
    expect(wrongBench.ok).toBe(false);
    const otherTech = await finishBenchCase(zoca, crown);
    expect(otherTech.ok).toBe(false);

    const board = await listFinishedBoard(ana);
    expect(board?.map((row) => row.id)).toContain(nightguard);
    expect(board?.map((row) => row.id)).not.toContain(crown);
    expect(board?.every((row) => row.technician_name === "Negar Qureshi")).toBe(true);

    const report = await productionReport(ana);
    const today = DateTime.now().setZone(LAB_ZONE).toISODate();
    const todayRow = report?.days.find((day) => day.workDate === today);
    expect(todayRow?.cases.map((row) => row.id)).toContain(nightguard);
    expect(todayRow?.cases.map((row) => row.id)).not.toContain(crown);

    const zocaBoard = await listFinishedBoard(zoca);
    expect(zocaBoard).toBeNull();
    const zocaReport = await productionReport(zoca);
    expect(zocaReport).toBeNull();

    const open = await listFinishToday(ana);
    expect(open.map((row) => row.id)).not.toContain(nightguard);

    expect((await undoBenchFinish(zoca, nightguard)).ok).toBe(false);
    expect((await undoBenchFinish(ana, nightguard)).ok).toBe(false);
    const undone = await undoBenchFinish(negar, nightguard);
    expect(undone.ok).toBe(true);
    expect((await undoBenchFinish(negar, nightguard)).ok).toBe(false);

    const boardAfter = await listFinishedBoard(ana);
    expect(boardAfter?.map((row) => row.id)).not.toContain(nightguard);
    const mine = await listMyFinishesToday(negar);
    expect(mine.map((row) => row.id)).not.toContain(nightguard);
    const openAgain = await listFinishToday(negar);
    expect(openAgain.map((row) => row.id)).toContain(nightguard);
  });
});

async function person(email: string, name: string, role: string) {
  const sql = await getSql();
  const [existing] = await sql<{ id: string }[]>`select id from profiles where lower(email) = lower(${email})`;
  if (existing) return existing.id;
  const [row] = await sql<{ id: string }[]>`
    insert into profiles (full_name, email, role, can_view_clinic_identity)
    values (${name}, ${email}, ${role}::app_role, ${role !== "technician"})
    returning id
  `;
  return row.id;
}

async function insertCase(caseNumber: string, caseType: string, due: string | null) {
  const sql = await getSql();
  const [row] = await sql<{ id: string }[]>`
    insert into cases (case_number, patient_name, case_type, overall_status, historical, requested_delivery_at, dentist_code)
    values (${caseNumber}, 'Bench Patient', ${caseType}, 'in_production', false, ${due}, 'DR-1')
    returning id
  `;
  return row.id;
}
