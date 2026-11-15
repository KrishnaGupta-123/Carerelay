import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
const secret = process.env.CRON_SECRET;
if (!secret || secret.length < 32)
  throw new Error(
    "Set CRON_SECRET to a cryptographically random value with at least 32 characters.",
  );
const hash = createHash("sha256").update(secret).digest("hex");
await mkdir(".data", { recursive: true });
const sql = `-- CareRelay worker configuration. Only a hash is stored, never the raw secret.\nupdate public.job_settings set value='${hash}' where key='cron_secret_hash';\n`;
await writeFile(".data/setup-worker.sql", sql);
const upgrades = await Promise.all(
  ["004_hardening.sql", "005_outbox_claim.sql"].map((f) =>
    readFile(`supabase/migrations/${f}`, "utf8"),
  ),
);
await writeFile(".data/upgrade-supabase.sql", upgrades.join("\n") + "\n" + sql);
if (process.env.DATABASE_URL) {
  const db = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require" });
  await db`update public.job_settings set value=${hash} where key='cron_secret_hash'`;
  await db.end();
  console.log("Worker secret hash configured in hosted PostgreSQL.");
} else
  console.log(
    "Run .data/setup-worker.sql in Supabase SQL Editor. For an existing initial installation, run .data/upgrade-supabase.sql instead (includes migrations 004 and 005). The raw secret was not printed.",
  );
