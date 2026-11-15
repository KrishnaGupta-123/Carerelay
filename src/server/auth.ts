import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocalMode, localAuthAllowed, userFromLocalSession } from "./local-db";
import { supabaseServer } from "./supabase";
import type { User } from "@/lib/types";
export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get("care_session")?.value;
  if (localAuthAllowed() && token) { const user = await userFromLocalSession(token); if (user) return user; }
  if (isLocalMode()) return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  return user ? { id:user.id, email:user.email || "", name:user.user_metadata.name || user.email?.split("@")[0] || "Member" } : null;
}
export async function requireUser() { const user = await getUser(); if (!user) redirect("/login"); return user; }
