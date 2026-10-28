import { NextRequest, NextResponse } from "next/server";
import { runReminderJob } from "@/lib/domain/jobs";

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || provided !== secret) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const result = await runReminderJob();
  return NextResponse.json(result);
}
