import type { Config } from "@netlify/functions";

/** Pulls the Google Sheet into the lab DB on a schedule (day-to-day live updates). */
export default async function handler() {
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET || "";
  if (!base || !secret) {
    return new Response("APP_URL or CRON_SECRET missing", { status: 500 });
  }
  const response = await fetch(`${base}/api/jobs/tracker-sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await response.text();
  return new Response(text, { status: response.status });
}

export const config: Config = {
  schedule: "*/2 * * * *",
};
