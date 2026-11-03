import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { runAs } from "../domain/common";
import { readSession, readSupabaseSubject } from "./session";

/** One DB actor lookup per request (layout + page share this). */
export const currentActor = cache(async () => {
  const jar = await cookies();
  const token = jar.get("zann_session")?.value;
  const supabaseToken = jar.get("sb-access-token")?.value;
  const userId = token ? await readSession(token) : supabaseToken ? await readSupabaseSubject(supabaseToken) : null;
  if (!userId) return null;
  try {
    return await runAs(userId, async (_tx, actor) => actor);
  } catch {
    return null;
  }
});

export const requireActorPage = cache(async () => {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  return actor;
});
