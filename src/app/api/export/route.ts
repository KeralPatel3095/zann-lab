import { NextRequest, NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/current";
import { exportCases } from "@/lib/domain/transfer";

export async function GET(request: NextRequest) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const file = await exportCases(actor.id, format);
  return new NextResponse(file.buffer, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    },
  });
}
