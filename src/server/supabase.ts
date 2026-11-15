import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
export function supabaseKey() { return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""; }
export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,supabaseKey(),{
    cookies: {
      getAll() { return jar.getAll(); },
      setAll(values) { try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Server Components cannot write cookies; route handlers refresh sessions. */ } },
    },
  });
}
export function supabaseWorker() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,supabaseKey(),{ auth: { persistSession:false, autoRefreshToken:false } }); }
