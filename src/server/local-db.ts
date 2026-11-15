import "server-only";
import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID, randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";
import type { CareData, User } from "@/lib/types";

type DbGlobal = typeof globalThis & { careDb?: Promise<PGlite>; careDbKey?: string };
const g = globalThis as DbGlobal;
export function localAuthAllowed() { return process.env.LOCAL_DEVELOPMENT_MODE === "true" && process.env.NODE_ENV !== "production"; }
export function isLocalMode(user?: User) {
  if (user?.authMode === "local" && localAuthAllowed()) return true;
  if (process.env.CARERELAY_FORCE_LOCAL === "true" && process.env.LOCAL_DEVELOPMENT_MODE === "true" && process.env.NODE_ENV !== "production") return true;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.LOCAL_DEVELOPMENT_MODE === "true" && process.env.NODE_ENV !== "production";
}
export async function localDb() {
  const dbPath = process.env.CARERELAY_TEST_DB || path.resolve(/* turbopackIgnore: true */ process.env.LOCAL_DATABASE_PATH || ".data/postgres");
  if (!g.careDb || g.careDbKey !== dbPath) {
    g.careDbKey = dbPath;
    g.careDb = (async () => {
      if (dbPath !== "memory://") await mkdir(dbPath, { recursive: true });
      const db = new PGlite(dbPath === "memory://" ? undefined : dbPath);
      await db.waitReady;
      await db.exec("create table if not exists public.care_migrations(name text primary key,applied_at timestamptz default now());");
      const applied = await db.query<{ name: string }>("select name from care_migrations");
      const files = ["001_carerelay.sql", "002_care_actions.sql", "003_notifications.sql"];
      if (!applied.rows.length) {
        await db.exec(`
          create schema if not exists auth;
          create table if not exists auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
          create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
          do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
            if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
            if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;
          grant usage on schema public,auth to authenticated,anon,service_role;
          grant execute on function auth.uid() to authenticated,anon,service_role;
        `);
      }
      for (const name of files) {
        if (applied.rows.some(r => r.name === name)) continue;
        await db.exec(await readFile(path.join(process.cwd(), "supabase/migrations", name), "utf8"));
        await db.query("insert into care_migrations(name) values($1)", [name]);
      }
      await db.exec(`
        create table if not exists local_credentials(user_id uuid primary key references auth.users(id), password_hash text not null);
        create table if not exists local_sessions(token_hash text primary key,user_id uuid references auth.users(id) on delete cascade,expires_at timestamptz not null);
        create table if not exists local_reset_tokens(token_hash text primary key,user_id uuid references auth.users(id),expires_at timestamptz not null,consumed_at timestamptz);
      `);
      return db;
    })();
  }
  return g.careDb;
}
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, digest] = stored.split(":");
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function createLocalUser(email: string, name: string, password: string) {
  const db = await localDb();
  const id = randomUUID();
  await db.transaction(async tx => {
    const exists = await tx.query("select 1 from users where lower(email)=lower($1)", [email]);
    if (exists.rows.length) throw new Error("An account with this email already exists");
    await tx.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)", [id,email,JSON.stringify({name})]);
    await tx.query("insert into local_credentials(user_id,password_hash) values($1,$2)", [id,passwordHash(password)]);
  });
  return { id, email, name };
}
export async function localLogin(email: string, password: string) {
  const db = await localDb();
  const rows = await db.query<User & { password_hash: string }>("select u.*,c.password_hash from users u join local_credentials c on c.user_id=u.id where lower(email)=lower($1)", [email]);
  // Equal-cost hashing for unknown users, to reduce account enumeration timing differences.
  const stored = rows.rows[0]?.password_hash || "c29a82a0b03c1741e7f0f8e467119b2b:3d4373d770426f92b58ebd6a89fc26512b78fa55eb2e8f41eb624798b21e731b1d9a0b899d375a1edff0866c39fa2b1ffbe7c417edb23c879a7b39b7d82137c0";
  if (!verifyPassword(password,stored) || !rows.rows[0]) throw new Error("Email or password is incorrect");
  const { id, name } = rows.rows[0];
  return { id, name, email: rows.rows[0].email };
}
export async function createLocalSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const db = await localDb();
  await db.query("insert into local_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '7 days')", [hashToken(token),userId]);
  return token;
}
export async function userFromLocalSession(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const db = await localDb();
  const r = await db.query<User>("select u.id,u.name,u.email from users u join local_sessions s on s.user_id=u.id where s.token_hash=$1 and s.expires_at>now()", [hashToken(token)]);
  return r.rows[0] ? { ...r.rows[0], authMode: "local" } : null;
}
export async function localRpc<T = Record<string, unknown>>(userId: string | null, name: string, args: unknown[]): Promise<T> {
  if (!["care_bootstrap","care_action","care_test_reminder","care_worker"].includes(name)) throw new Error("Unsupported RPC");
  const db = await localDb();
  return db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [userId || ""]);
    await tx.exec("set local role authenticated");
    const placeholders = args.map((_,i) => `$${i+1}`).join(",");
    const r = await tx.query<{ result: T }>(`select public.${name}(${placeholders}) as result`, args.map(a => typeof a === "object" && a !== null ? JSON.stringify(a) : a));
    return r.rows[0].result;
  });
}
export async function localBootstrap(userId: string, profileId?: string): Promise<CareData> { return localRpc<CareData>(userId, "care_bootstrap", [profileId || null]); }
