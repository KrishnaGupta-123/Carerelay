import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { seedLocal, demoAccounts } from "../src/server/seed";
import { seedCareScenario } from "../src/server/demo-scenario";
import type { CareData } from "../src/lib/types";
const local = process.argv.includes("--local");
if (local) {
  process.env.LOCAL_DEVELOPMENT_MODE = "true";
  const password = process.env.DEMO_PASSWORD || `Care-${randomBytes(10).toString("base64url")}!`;
  const result = await seedLocal(password);
  if (result.created) {
    await writeFile(
      process.env.CARE_DEMO_CREDENTIALS || ".data/demo-accounts.json",
      JSON.stringify({ password, accounts: demoAccounts }, null, 2),
    );
    console.log(
      `Local demo credentials saved to ${process.env.CARE_DEMO_CREDENTIALS || ".data/demo-accounts.json"} (ignored by Git).`,
    );
  }
  console.log(result.message);
} else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    service = process.env.SUPABASE_SERVICE_ROLE_KEY,
    password = process.env.DEMO_PASSWORD;
  if (!url || !service || !password || password.length < 12)
    throw new Error(
      "Hosted seed requires SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD (12+ characters). Use --local for the development demo.",
    );
  const client = createClient(url, service, { auth: { persistSession: false } });
  // Stop before creating anything if one of these fictional addresses exists.
  // Existing passwords, users and healthcare records are never overwritten.
  let page = 1;
  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    if (data.users.some((user) => demoAccounts.some((account) => account.email === user.email)))
      throw new Error(
        "A fictional demo account already exists. Existing users and records were preserved; use those accounts rather than reseeding.",
      );
    if (data.users.length < 1000) break;
    page++;
  }
  const accounts = [];
  for (const acc of demoAccounts) {
    const { data, error } = await client.auth.admin.createUser({
      email: acc.email,
      password,
      email_confirm: true,
      user_metadata: { name: acc.name },
    });
    if (error)
      throw new Error(`${acc.email}: ${error.message}. Existing users are never overwritten.`);
    accounts.push({ user: data.user!, account: acc });
  }
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sessions: SupabaseClient[] = [];
  for (const acc of accounts) {
    const c = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email: acc.account.email, password });
    if (error) throw error;
    sessions.push(c);
  }
  await seedCareScenario({
    action: async (actor, profile, kind, payload) => {
      const { data, error } = await sessions[actor].rpc("care_action", {
        profile_: profile,
        kind_: kind,
        payload_: payload,
      });
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    bootstrap: async (actor, profile) => {
      const { data, error } = await sessions[actor].rpc("care_bootstrap", {
        requested_profile: profile,
      });
      if (error) throw error;
      return data as CareData;
    },
  });
  console.log(
    "Hosted fictional accounts, care circle, medications, dose reports, instruction history, handoffs and appointment created. Sign in with an individual demo account. No emails were sent by this seed.",
  );
}
process.exit(0);
