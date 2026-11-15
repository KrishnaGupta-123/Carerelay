import { beforeAll, describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { localDb, localRpc, createLocalUser } from "@/server/local-db";
import type { CareData, User } from "@/lib/types";
process.env.CARERELAY_TEST_DB = "memory://";
process.env.LOCAL_DEVELOPMENT_MODE = "true";
const secret = "isolated-worker-test-secret-at-least-32-characters";
let owner: User, profile: string;
const call = (kind: string, payload: unknown) =>
  localRpc<Record<string, unknown>>(owner.id, "care_action", [profile, kind, payload]);
beforeAll(async () => {
  owner = await createLocalUser("outbox@test.invalid", "Outbox Owner", "Test-Outbox-Password1!");
  const p = await localRpc<{ id: string }>(owner.id, "care_action", [
    null,
    "create_profile",
    {
      preferred_name: "Outbox Owner",
      timezone: "Asia/Kolkata",
      date_of_birth: null,
      notes: "Synthetic",
    },
  ]);
  profile = p.id;
  const db = await localDb();
  await db.query("update job_settings set value=$1 where key='cron_secret_hash'", [
    createHash("sha256").update(secret).digest("hex"),
  ]);
});
describe("Persistent delivery queue", () => {
  it("deduplicates, atomically claims, and records provider failure and success", async () => {
    const db = await localDb();
    for (let i = 0; i < 2; i++)
      await db.query(
        "select enqueue_notification($1,$2,'reminder_test','Test reminder','Synthetic body','outbox-key')",
        [profile, owner.id],
      );
    expect(
      (await db.query("select * from notifications where idempotency_key='outbox-key'")).rows,
    ).toHaveLength(1);
    const claimed = await localRpc<{ id: string }[]>(null, "care_worker", [
      secret,
      "claim",
      { profile },
    ]);
    expect(claimed).toHaveLength(1);
    expect(await localRpc(null, "care_worker", [secret, "claim", { profile }])).toEqual([]);
    await localRpc(null, "care_worker", [
      secret,
      "finish",
      { id: claimed[0].id, status: "failed", error: "Synthetic provider rejection" },
    ]);
    const failed = await db.query<{ status: string; error: string; attempts: number }>(
      "select status,error,attempts from notifications where id=$1",
      [claimed[0].id],
    );
    expect(failed.rows[0]).toEqual({
      status: "failed",
      error: "Synthetic provider rejection",
      attempts: 1,
    });
    await db.query("update notifications set locked_at=now()-interval '5 minutes' where id=$1", [
      claimed[0].id,
    ]);
    const retry = await localRpc<{ id: string }[]>(null, "care_worker", [
      secret,
      "claim",
      { profile },
    ]);
    expect(retry).toHaveLength(1);
    await localRpc(null, "care_worker", [
      secret,
      "finish",
      { id: retry[0].id, status: "sent", provider_id: "synthetic-provider-id" },
    ]);
    expect(
      (
        await db.query<{ status: string; attempts: number }>(
          "select status,attempts from notifications where id=$1",
          [retry[0].id],
        )
      ).rows[0],
    ).toEqual({ status: "sent", attempts: 2 });
    expect(await localRpc(null, "care_worker", [secret, "claim", { profile }])).toEqual([]);
  });
  it("records missing credentials honestly and permits later configured delivery", async () => {
    const db = await localDb();
    await db.query(
      "select enqueue_notification($1,$2,'reminder_test','Unconfigured test','Synthetic','outbox-unconfigured')",
      [profile, owner.id],
    );
    const claimed = await localRpc<{ id: string }[]>(null, "care_worker", [
      secret,
      "claim",
      { profile },
    ]);
    await localRpc(null, "care_worker", [
      secret,
      "finish",
      { id: claimed[0].id, status: "unconfigured", error: "RESEND_API_KEY not configured" },
    ]);
    expect(
      (
        await db.query<{ status: string; attempts: number }>(
          "select status,attempts from notifications where id=$1",
          [claimed[0].id],
        )
      ).rows[0],
    ).toEqual({ status: "unconfigured", attempts: 0 });
    const retry = await localRpc<{ id: string }[]>(null, "care_worker", [
      secret,
      "claim",
      { profile },
    ]);
    expect(retry).toHaveLength(1);
    await localRpc(null, "care_worker", [
      secret,
      "finish",
      { id: retry[0].id, status: "sent", provider_id: "synthetic-configured" },
    ]);
  });
  it("suppresses stale reminders after a dose status changes", async () => {
    const db = await localDb();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    await call("save_medication", {
      name: "Outbox medicine",
      strength: "5 mg",
      dosage: "1 tablet",
      form: "tablet",
      route: "Oral",
      instructions: "Synthetic",
      source: "Fictional",
      start_date: today,
      end_date: null,
      times: ["08:00"],
      days: [0, 1, 2, 3, 4, 5, 6],
      reminder_minutes: 15,
      reminders_enabled: true,
      responsible_member_id: null,
    });
    const data = await localRpc<CareData>(owner.id, "care_bootstrap", [profile]);
    const dose = data.doses[0];
    await db.query(
      "update dose_events set scheduled_at=now()-interval '2 hours',status='unconfirmed' where id=$1",
      [dose.id],
    );
    await db.query(
      "select enqueue_notification($1,$2,'dose_unconfirmed','Medication status has not yet been updated','Synthetic',$3)",
      [profile, owner.id, `dose-unconfirmed:${dose.id}:${owner.id}`],
    );
    await call("dose_status", {
      id: dose.id,
      expected_version: dose.version,
      status: "self_reported_taken",
      note: "Synthetic report",
    });
    const claimed = await localRpc<{ id: string }[]>(null, "care_worker", [
      secret,
      "claim",
      { profile },
    ]);
    expect(claimed).toHaveLength(0);
    const n = await db.query<{ status: string; error: string }>(
      "select status,error from notifications where kind='dose_unconfirmed'",
    );
    expect(n.rows[0].status).toBe("failed");
    expect(n.rows[0].error).toContain("no longer needs");
  });
  it("prevents recipient preferences from being bypassed by queued emails", async () => {
    const db = await localDb();
    await db.query(
      "select enqueue_notification($1,$2,'reminder_test','Preferences test','Synthetic','outbox-opt-out')",
      [profile, owner.id],
    );
    await db.query(
      "update care_members set email_enabled=false where profile_id=$1 and user_id=$2",
      [profile, owner.id],
    );
    expect(await localRpc(null, "care_worker", [secret, "claim", { profile }])).toEqual([]);
    const n = await db.query<{ status: string }>(
      "select status from notifications where idempotency_key='outbox-opt-out'",
    );
    expect(n.rows[0].status).toBe("failed");
  });
});
