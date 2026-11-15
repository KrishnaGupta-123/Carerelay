import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { localDb } from "../src/server/local-db";
const local = process.argv.includes("--local");
if (local) {
  await localDb();
  console.log("Local PostgreSQL migrations applied.");
} else {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Set DATABASE_URL to run hosted migrations, or apply scripts/setup-supabase.sql in the Supabase SQL Editor. Use --local for embedded development storage.",
    );
  const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require" });
  await sql.unsafe(
    "create table if not exists public.care_migrations(name text primary key,applied_at timestamptz default now())",
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const applied = await sql`select name from public.care_migrations where name=${file}`;
    if (applied.length) continue;
    await sql.unsafe(await readFile(path.join("supabase/migrations", file), "utf8"));
    await sql`insert into public.care_migrations(name) values(${file})`;
    console.log(`Applied ${file}`);
  }
  await sql.end();
}
process.exit(0);
