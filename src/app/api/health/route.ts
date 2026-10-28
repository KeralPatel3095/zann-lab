import { NextResponse } from "next/server";
import { getSql } from "@/lib/db/sql";

export async function GET() {
  try {
    const sql = await getSql();
    await sql`select 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
