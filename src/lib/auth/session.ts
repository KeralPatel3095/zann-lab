import { SignJWT, jwtVerify } from "jose";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) throw new Error("SESSION_SECRET is not configured");
  return new TextEncoder().encode(value);
}

export async function signSession(userId: string) {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function readSession(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

export async function readSupabaseSubject(token: string) {
  const configured = process.env.SUPABASE_JWT_SECRET;
  if (!configured) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(configured));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
