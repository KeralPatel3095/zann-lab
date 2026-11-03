import { NextRequest, NextResponse } from "next/server";
import { syncConfiguredTracker } from "@/lib/domain/tracker-sync";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  try {
    await syncConfiguredTracker();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
