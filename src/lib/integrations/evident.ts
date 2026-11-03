import { DateTime } from "luxon";
import { LAB_ZONE } from "../scheduling/calendar";

export type EvidentDayCount = {
  day: string;
  total: number;
};

export type EvidentEnteredReport = {
  configured: boolean;
  connected: boolean;
  error: string | null;
  day: string;
  todayCount: number;
  daily: EvidentDayCount[];
};

type EvidentConfig = {
  baseUrl: string;
  apiKey: string;
  labId: string;
  /** Relative path for daily entered-case counts. Adjust once Evident shares the final route. */
  enteredPath: string;
};

function config(): EvidentConfig | null {
  const baseUrl = (process.env.EVIDENT_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.EVIDENT_API_KEY ?? "").trim();
  if (!baseUrl || !apiKey) return null;
  return {
    baseUrl,
    apiKey,
    labId: (process.env.EVIDENT_LAB_ID ?? "").trim(),
    enteredPath: (process.env.EVIDENT_ENTERED_PATH ?? "/v1/cases/entered").trim() || "/v1/cases/entered",
  };
}

export function isEvidentConfigured() {
  return Boolean(config());
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-Api-Key": apiKey,
  };
}

/** Pull a numeric total from common Evident-style payload shapes. */
function readTotal(payload: unknown): number | null {
  if (typeof payload === "number" && Number.isFinite(payload)) return Math.max(0, Math.round(payload));
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  for (const key of ["total", "count", "casesEntered", "cases_entered", "entered", "value"]) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Math.max(0, Math.round(Number(value)));
  }
  if (Array.isArray(row.cases)) return row.cases.length;
  if (Array.isArray(row.data)) return row.data.length;
  if (row.data && typeof row.data === "object") return readTotal(row.data);
  return null;
}

function readDailyRows(payload: unknown): EvidentDayCount[] {
  if (!payload || typeof payload !== "object") return [];
  const row = payload as Record<string, unknown>;
  const list = Array.isArray(row.daily)
    ? row.daily
    : Array.isArray(row.days)
      ? row.days
      : Array.isArray(row.data)
        ? row.data
        : [];
  const out: EvidentDayCount[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const dayRaw = String(entry.day ?? entry.date ?? entry.enteredOn ?? entry.entered_on ?? "").slice(0, 10);
    const total = readTotal(entry);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayRaw) || total === null) continue;
    out.push({ day: dayRaw, total });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}

async function fetchEvidentJson(cfg: EvidentConfig, pathWithQuery: string) {
  const url = pathWithQuery.startsWith("http") ? pathWithQuery : `${cfg.baseUrl}${pathWithQuery.startsWith("/") ? "" : "/"}${pathWithQuery}`;
  const response = await fetch(url, {
    method: "GET",
    headers: authHeaders(cfg.apiKey),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Evident responded ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

/**
 * Daily cases entered from Evident.
 * Set EVIDENT_API_BASE_URL + EVIDENT_API_KEY (and optional EVIDENT_LAB_ID / EVIDENT_ENTERED_PATH).
 * Path/query mapping can be adjusted once Evident confirms the Open API contract.
 */
export async function evidentCasesEnteredReport(day?: string): Promise<EvidentEnteredReport> {
  const selected = DateTime.fromISO(day || "", { zone: LAB_ZONE });
  const focus = selected.isValid ? selected.startOf("day") : DateTime.now().setZone(LAB_ZONE).startOf("day");
  const focusIso = focus.toISODate() ?? "";
  const rangeStart = focus.minus({ days: 30 }).toISODate() ?? focusIso;
  const cfg = config();

  if (!cfg) {
    return {
      configured: false,
      connected: false,
      error: null,
      day: focusIso,
      todayCount: 0,
      daily: [],
    };
  }

  try {
    const params = new URLSearchParams({
      from: rangeStart,
      to: focusIso,
      day: focusIso,
    });
    if (cfg.labId) params.set("labId", cfg.labId);

    const payload = await fetchEvidentJson(cfg, `${cfg.enteredPath}?${params.toString()}`);
    let daily = readDailyRows(payload);
    let todayCount = daily.find((row) => row.day === focusIso)?.total;

    if (todayCount === undefined) {
      const single = readTotal(payload);
      if (single !== null) {
        todayCount = single;
        if (!daily.some((row) => row.day === focusIso)) {
          daily = [{ day: focusIso, total: single }, ...daily];
        }
      }
    }

    return {
      configured: true,
      connected: true,
      error: null,
      day: focusIso,
      todayCount: todayCount ?? 0,
      daily,
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      error: error instanceof Error ? error.message : "Evident request failed",
      day: focusIso,
      todayCount: 0,
      daily: [],
    };
  }
}
