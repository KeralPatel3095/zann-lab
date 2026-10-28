import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "./lib/auth/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/health") || pathname.startsWith("/api/jobs")) {
    return NextResponse.next();
  }
  const token = request.cookies.get("zann_session")?.value;
  const userId = token ? await readSession(token) : null;
  if (!userId) {
    const login = new URL("/login", request.url);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
