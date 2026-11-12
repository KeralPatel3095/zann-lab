import { createHash } from "crypto";
import { DateTime } from "luxon";
import { getSql, type Tx } from "../db/sql";
import { LAB_ZONE } from "../scheduling/calendar";
import { officeCode, parseTrackerWorkbook, spreadsheetIdFromInput, type TrackerCase } from "../sheet/tracker";
import { hasBackendAccess, runAs, type ActionResult } from "./common";

type SyncCounts = {
  created: number;
  updated: number;
  unchanged: number;
  invalid: number;
  pickups: number;
};

export async function trackerStatus(userId: string) {
  const allowed = await runAs(userId, async (_tx, actor) => hasBackendAccess(actor));
  if (!allowed) return { url: "", message: "", checkedAt: "" };
  return {
    url: await readSetting("tracker_sheet_url"),
    message: await readSetting("tracker_sync_message"),
    checkedAt: await readSetting("tracker_sync_checked_at"),
  };
}

export async function saveTrackerSheetUrl(userId: string, url: string): Promise<ActionResult> {
  const actor = await runAs(userId, async (_tx, current) => current);
  if (!hasBackendAccess(actor)) return { ok: false, message: "Not allowed" };
  const trimmed = url.trim();
  const { isAppsScriptBridgeUrl } = await import("../integrations/google-sheet");
  const hasServiceAccount = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
  );
  if (trimmed && isAppsScriptBridgeUrl(trimmed)) {
    // ok — Apps Script bridge
  } else if (trimmed && spreadsheetIdFromInput(trimmed)) {
    if (!hasServiceAccount) {
      return {
        ok: false,
        message:
          "Normal Google Sheet links need a service account. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in Netlify, share the sheet with that email as Viewer, redeploy, then Save and sync.",
      };
    }
  } else if (trimmed) {
    return {
      ok: false,
      message: "Paste the Google Sheet link (with service account configured) or an Apps Script /exec?key=… URL.",
    };
  }
  await putSetting("tracker_sheet_url", trimmed);
  return { ok: true };
}

export async function applyTrackerWorkbook(
  userId: string,
  bytes: Uint8Array,
  options?: { automated?: boolean },
): Promise<ActionResult<SyncCounts & { message: string }>> {
  const parsed = await parseTrackerWorkbook(bytes);
  if (!parsed.cases.length) return { ok: false, message: "That file does not contain the monthly case tracker sheets." };
  const counts: SyncCounts = { created: 0, updated: 0, unchanged: 0, invalid: 0, pickups: 0 };
  const actorId = await runAs(userId, async (tx, actor) => {
    if (!options?.automated && !hasBackendAccess(actor)) throw new Error("Not allowed");
    return actor.id;
  });
  const byNumber = await runAs(userId, async (tx) => {
    const existing = await tx<{ id: string; case_number: string; tracker_fingerprint: string; tracker_status: string; tracker_due: string }[]>`
      select id, case_number, tracker_fingerprint, tracker_status, tracker_due from cases
    `;
    return new Map(existing.map((row) => [row.case_number.toLowerCase(), row]));
  });
  const pendingCases = parsed.cases.filter(
    (row) => !trackerRowIsCurrent(row, byNumber.get(row.caseNumber.toLowerCase()) ?? null),
  );
  counts.unchanged = parsed.cases.length - pendingCases.length;
  const clinicByCode = await runAs(userId, async (tx) => {
    const clinics = await tx<{ id: string; dentist_code: string }[]>`select id, dentist_code from clinic_accounts`;
    return new Map(clinics.map((row) => [row.dentist_code.toLowerCase(), row.id]));
  });
  const offices = [...new Set(pendingCases.map((row) => row.officeName.trim()).filter(Boolean))];
  for (let index = 0; index < offices.length; index += 15) {
    const slice = offices.slice(index, index + 15);
    await runAs(userId, async (tx) => {
      for (const officeName of slice) {
        const code = officeCode(officeName);
        if (clinicByCode.has(code)) continue;
        const [created] = await tx<{ id: string }[]>`
          insert into clinic_accounts (dentist_code, dentist_name, clinic_name)
          values (${code}, ${officeName}, ${officeName})
          returning id
        `;
        clinicByCode.set(code, created.id);
      }
    });
  }
  const prepared = { actorId, byNumber, clinicByCode };

  const batchSize = 20;
  if (pendingCases.length) console.log(`tracker sync writing ${pendingCases.length} changed cases`);
  for (let index = 0; index < pendingCases.length; index += batchSize) {
    const slice = pendingCases.slice(index, index + batchSize);
    await runAs(userId, async (tx) => {
      await tx.unsafe("set local statement_timeout = '60s'");
      for (const row of slice) {
        const outcome = await writeCase(
          tx,
          prepared.actorId,
          row,
          prepared.clinicByCode,
          prepared.byNumber.get(row.caseNumber.toLowerCase()) ?? null,
        );
        counts[outcome] += 1;
      }
    });
  }
  const knownPickups = await runAs(userId, async (tx) => {
    const rows = await tx<{ fingerprint: string }[]>`select fingerprint from tracker_pickups`;
    return new Set(rows.map((row) => row.fingerprint));
  });
  const pendingPickups = parsed.pickups.filter((pickup) => !knownPickups.has(pickup.fingerprint));
  for (let index = 0; index < pendingPickups.length; index += batchSize) {
    const slice = pendingPickups.slice(index, index + batchSize);
    await runAs(userId, async (tx) => {
      await tx.unsafe("set local statement_timeout = '60s'");
      for (const pickup of slice) {
        const inserted = await tx<{ id: string }[]>`
          insert into tracker_pickups (sheet_name, pickup_on, detail, fingerprint)
          values (${pickup.sheetName}, ${pickup.pickupOn}, ${pickup.detail}, ${pickup.fingerprint})
          on conflict (fingerprint) do nothing
          returning id
        `;
        counts.pickups += inserted.length;
      }
    });
  }
  return { ok: true, message: syncMessage(counts), ...counts };
}

const syncState = globalThis as unknown as { __zannTrackerSync?: Promise<void> };

export async function syncConfiguredTracker() {
  if (syncState.__zannTrackerSync) return;
  syncState.__zannTrackerSync = runConfiguredTracker().finally(() => {
    syncState.__zannTrackerSync = undefined;
  });
  await syncState.__zannTrackerSync;
}

async function runConfiguredTracker() {
  const userId = await schedulerId();
  const downloaded = await loadTrackerBytes();
  if (!downloaded.ok) {
    await putSetting("tracker_sync_message", downloaded.message);
    return;
  }
  const sheetHash = createHash("sha1").update(downloaded.bytes).digest("hex");
  await putSetting("tracker_sync_checked_at", DateTime.now().setZone(LAB_ZONE).toISO() ?? "");
  if ((await readSetting("tracker_sheet_hash")) === sheetHash) return;
  const result = await applyTrackerWorkbook(userId, downloaded.bytes, { automated: true });
  await putSetting("tracker_sync_message", result.message);
  if (result.ok) await putSetting("tracker_sheet_hash", sheetHash);
}

/** Prefer live Apps Script / Google URL; local Excel is only a backup. */
export async function loadTrackerBytes(): Promise<{ ok: true; bytes: Buffer } | { ok: false; message: string }> {
  const url = await readSetting("tracker_sheet_url");
  const { isAppsScriptBridgeUrl } = await import("../integrations/google-sheet");
  if (url.trim() && (isAppsScriptBridgeUrl(url) || spreadsheetIdFromInput(url))) {
    const remote = await downloadSpreadsheet(url);
    if (remote.ok) return remote;
    const local = await readLocalTrackerFile();
    if (local?.ok) return local;
    return remote;
  }
  const local = await readLocalTrackerFile();
  if (local) return local;
  return {
    ok: false,
    message:
      "No tracker source yet. Paste the Apps Script /exec?key=… URL on Import (permanent live sync).",
  };
}

async function readLocalTrackerFile(): Promise<{ ok: true; bytes: Buffer } | { ok: false; message: string } | null> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const configured = process.env.TRACKER_LOCAL_FILE?.trim();
  const candidates = [
    configured,
    path.join(process.cwd(), "data", "tracker.xlsx"),
  ].filter((value): value is string => Boolean(value));

  for (const filePath of candidates) {
    try {
      const bytes = await fs.readFile(filePath);
      if (bytes.length < 64) continue;
      return { ok: true, bytes };
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function writeCase(
  tx: Tx,
  userId: string,
  row: TrackerCase,
  clinicByCode: Map<string, string>,
  existing: { id: string; tracker_fingerprint: string; tracker_status: string; tracker_due: string } | null,
): Promise<keyof Pick<SyncCounts, "created" | "updated" | "unchanged" | "invalid">> {
  if (trackerRowIsCurrent(row, existing)) return "unchanged";
  await tx.unsafe("SAVEPOINT tracker_row");
  try {
    const mapped = mapStatus(row.status);
    const rush = /asap/i.test(row.dueRaw);
    // New sheet rows count as received on the sync day (first time we see the case).
    const receivedToday = atLocal(DateTime.now().setZone(LAB_ZONE).toISODate(), "12:00:00");
    const delivery = atLocal(row.dueOn, "16:30:00");
    const scheduleNote = row.dueOn ? "" : row.dueRaw.slice(0, 500);
    const clinicId = row.officeName.trim() ? clinicByCode.get(officeCode(row.officeName)) ?? null : null;
    const code = row.officeName.trim() ? officeCode(row.officeName) : "";
    const mark = deadlineIndicator(row.dueOn, mapped.terminal);
    let caseId = existing?.id || null;
    const [dispatch] = caseId
      ? await tx<{ id: string }[]>`select id from dispatch_records where case_id = ${caseId} and dispatched_at is not null`
      : [];
    const overall = mapped.terminal && !dispatch ? "in_production" : mapped.overall;
    const dispatchState = mapped.terminal && !dispatch ? "not_ready" : mapped.dispatch;
    if (!caseId) {
      const [created] = await tx<{ id: string }[]>`
        insert into cases (
          case_number, dentist_code, patient_name, pan_number, case_type, restoration_type, prescription,
          received_at, requested_delivery_at, priority, rush, overall_status, dispatch_status, deadline_indicator,
          historical, hold_reason, schedule_note, tracker_status, tracker_due, tracker_fingerprint, created_by
        ) values (
          ${row.caseNumber}, ${code}, ${row.patientName}, ${row.panNumber}, ${row.caseType}, ${row.caseType}, ${row.notes},
          ${receivedToday}, ${delivery}, ${rush ? "rush" : "normal"}::priority_level, ${rush},
          ${overall}::case_status, ${dispatchState}::dispatch_state, ${mark}::deadline_indicator,
          ${mapped.historical}, ${mapped.holdReason}, ${scheduleNote}, ${row.status.slice(0, 80)}, ${row.dueRaw.slice(0, 160)}, ${row.fingerprint}, ${userId}
        )
        returning id
      `;
      caseId = created.id;
    } else {
      await tx`
        update cases set
          dentist_code = ${code},
          patient_name = ${row.patientName},
          pan_number = ${row.panNumber},
          case_type = ${row.caseType},
          restoration_type = ${row.caseType},
          prescription = ${row.notes},
          requested_delivery_at = ${delivery},
          priority = ${rush ? "rush" : "normal"}::priority_level,
          rush = ${rush},
          overall_status = ${overall}::case_status,
          dispatch_status = ${dispatchState}::dispatch_state,
          deadline_indicator = ${mark}::deadline_indicator,
          historical = ${mapped.historical},
          hold_reason = ${mapped.holdReason},
          schedule_note = ${scheduleNote},
          tracker_status = ${row.status.slice(0, 80)},
          tracker_due = ${row.dueRaw.slice(0, 160)},
          tracker_fingerprint = ${row.fingerprint},
          version = version + 1
        where id = ${caseId}
      `;
    }
    if (clinicId) {
      await tx`
        insert into case_clinic_links (case_id, clinic_account_id)
        values (${caseId}, ${clinicId})
        on conflict (case_id) do update set clinic_account_id = excluded.clinic_account_id
      `;
    }
    if (mapped.terminal && !dispatch && caseId) {
      const when = delivery ?? receivedToday ?? DateTime.now().setZone(LAB_ZONE).toUTC().toISO();
      await tx`
        insert into dispatch_records (case_id, dispatched_at, delivered_at, notes)
        values (${caseId}, ${when}, ${mapped.overall === "delivered" ? when : null}, ${"Recorded from the case tracker."})
      `;
      await tx`
        update cases
        set overall_status = ${mapped.overall}::case_status,
            dispatch_status = ${mapped.dispatch}::dispatch_state,
            historical = true
        where id = ${caseId}
      `;
    }
    await tx.unsafe("RELEASE SAVEPOINT tracker_row");
    return existing ? "updated" : "created";
  } catch {
    await tx.unsafe("ROLLBACK TO SAVEPOINT tracker_row");
    return "invalid";
  }
}

export function trackerRowIsCurrent(
  row: { fingerprint: string; dueRaw: string },
  existing: { tracker_fingerprint: string; tracker_status: string; tracker_due: string } | null,
) {
  if (!existing?.tracker_status.trim()) return false;
  const dueSaved = !row.dueRaw.trim() || existing.tracker_due.trim() === row.dueRaw.slice(0, 160);
  return existing.tracker_fingerprint === row.fingerprint && dueSaved;
}

function mapStatus(status: string) {
  const value = status.trim().toLowerCase();
  if (value === "delivered" || value === "invoice" || /^picked[\s-]*up$/.test(value)) {
    return { overall: "delivered", dispatch: "delivered", historical: true, terminal: true, holdReason: "" };
  }
  if (value === "packing") {
    return { overall: "ready_for_dispatch", dispatch: "packed", historical: false, terminal: false, holdReason: "" };
  }
  if (value.includes("hold") || value.includes("waiting")) {
    return { overall: "on_hold", dispatch: "not_ready", historical: false, terminal: false, holdReason: status.slice(0, 200) };
  }
  if (value === "scheduled") {
    return { overall: "delivered", dispatch: "delivered", historical: true, terminal: true, holdReason: "" };
  }
  return { overall: "in_production", dispatch: "not_ready", historical: false, terminal: false, holdReason: "" };
}

function deadlineIndicator(dueOn: string | null, terminal: boolean) {
  if (terminal || !dueOn) return "on_track";
  const today = DateTime.now().setZone(LAB_ZONE).toISODate() ?? "";
  return dueOn < today ? "overdue" : "on_track";
}

function atLocal(day: string | null, time: string) {
  if (!day) return null;
  const parsed = DateTime.fromISO(`${day}T${time}`, { zone: LAB_ZONE });
  return parsed.isValid ? parsed.toUTC().toISO() : null;
}

function syncMessage(counts: SyncCounts) {
  return `Tracker sync: ${counts.created} added, ${counts.updated} updated, ${counts.unchanged} already current, ${counts.invalid} skipped, ${counts.pickups} pickup lines.`;
}

async function downloadSpreadsheet(url: string): Promise<{ ok: true; bytes: Buffer } | { ok: false; message: string }> {
  const { downloadTrackerSource } = await import("../integrations/google-sheet");
  return downloadTrackerSource(url);
}

async function readSetting(key: string) {
  const sql = await getSql();
  const [row] = await sql<{ setting_value: string }[]>`
    select setting_value from production_settings where setting_key = ${key}
  `;
  return row?.setting_value ?? "";
}

async function putSetting(key: string, value: string) {
  const sql = await getSql();
  await sql`
    insert into production_settings (setting_key, setting_value)
    values (${key}, ${value})
    on conflict (setting_key) do update
      set setting_value = excluded.setting_value, updated_at = now()
  `;
}

async function schedulerId() {
  const value = await readSetting("scheduler_user_id");
  if (!value) throw new Error("Scheduler is not configured");
  return value;
}
