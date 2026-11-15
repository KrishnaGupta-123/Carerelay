import "server-only";
import type { CareData, User } from "@/lib/types";
import { isLocalMode, localRpc } from "./local-db";
import { supabaseServer } from "./supabase";
export class CareError extends Error {
  constructor(message: string, public code = "validation", public status = 400) { super(message); }
}
export async function callCareRpc<T>(user: User, name: string, args: Record<string, unknown>, localArgs: unknown[]): Promise<T> {
  try {
    if (isLocalMode(user)) return await localRpc<T>(user.id,name,localArgs);
    const { data, error } = await (await supabaseServer()).rpc(name,args);
    if (error) {
      if (error.code === "PGRST202" || error.message.includes("schema cache")) throw new CareError("The CareRelay database needs setup. Apply the SQL migrations in your Supabase project.","setup",503);
      throw new CareError(error.message,error.code,error.code === "42501" ? 403 : error.code === "40001" ? 409 : 400);
    }
    return data as T;
  } catch (error) {
    if (error instanceof CareError) throw error;
    const e = error as Error & { code?: string };
    throw new CareError(e.message,e.code,e.code === "42501" ? 403 : e.code === "40001" ? 409 : 400);
  }
}
export async function loadCareData(user: User, profileId?: string): Promise<CareData> {
  const data = await callCareRpc<CareData>(user,"care_bootstrap",{requested_profile:profileId || null},[profileId || null]);
  return { ...data, user, mode: isLocalMode(user) ? "local" : "supabase", emailConfigured: !!process.env.RESEND_API_KEY };
}
export async function mutateCare(user: User, profileId: string | null, kind: string, payload: unknown) {
  const result = await callCareRpc<Record<string, unknown>>(user,"care_action",{profile_:profileId,kind_:kind,payload_:payload},[profileId,kind,payload]);
  if (result.error) throw new CareError(String(result.error),String(result.code || "validation"),result.code === "rate_limit" ? 429 : 400);
  return result;
}
