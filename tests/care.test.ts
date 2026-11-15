import { beforeAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import {
  localDb,
  localRpc,
  createLocalUser,
  createLocalSession,
  userFromLocalSession,
} from "@/server/local-db";
import type { CareData, User, Medication, Dose } from "@/lib/types";
import { medicationSchema } from "@/lib/validation";

process.env.CARERELAY_TEST_DB = "memory://";
process.env.LOCAL_DEVELOPMENT_MODE = "true";
const call = (u: User, p: string | null, k: string, payload: unknown) =>
  localRpc<Record<string, unknown>>(u.id, "care_action", [p, k, payload]);
let owner: User, coordinator: User, caretaker: User, viewer: User, stranger: User;
let profile: string, otherProfile: string;
let members: Record<string, string>;
let medication: Medication;
const today = () => formatInTimeZone(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
const input = () => ({
  name: "Fictional Test Medicine",
  strength: "5 mg",
  dosage: "1 tablet",
  form: "tablet",
  route: "Oral",
  instructions: "Recorded fictional prescription",
  source: "Fictional test prescription",
  start_date: today(),
  end_date: null,
  times: ["08:00", "20:00"],
  days: [0, 1, 2, 3, 4, 5, 6],
  reminder_minutes: 15,
  reminders_enabled: true,
  responsible_member_id: null,
});
const bootstrap = (u: User, p = profile) => localRpc<CareData>(u.id, "care_bootstrap", [p]);

beforeAll(async () => {
  owner = await createLocalUser("owner@test.invalid", "Test Owner", "Long-Test-Password1!");
  coordinator = await createLocalUser(
    "coordinator@test.invalid",
    "Test Coordinator",
    "Long-Test-Password1!",
  );
  caretaker = await createLocalUser(
    "caretaker@test.invalid",
    "Test Caretaker",
    "Long-Test-Password1!",
  );
  viewer = await createLocalUser("viewer@test.invalid", "Test Viewer", "Long-Test-Password1!");
  stranger = await createLocalUser(
    "stranger@test.invalid",
    "Test Stranger",
    "Long-Test-Password1!",
  );
  profile = String(
    (
      await call(owner, null, "create_profile", {
        preferred_name: "Test Owner",
        timezone: "Asia/Kolkata",
        date_of_birth: null,
        notes: "Synthetic",
      })
    ).id,
  );
  otherProfile = String(
    (
      await call(stranger, null, "create_profile", {
        preferred_name: "Other Owner",
        timezone: "Asia/Kolkata",
        date_of_birth: null,
        notes: "Synthetic private profile",
      })
    ).id,
  );
  for (const [user, role] of [
    [coordinator, "coordinator"],
    [caretaker, "caretaker"],
    [viewer, "viewer"],
  ] as const) {
    const code = (await call(owner, profile, "invite", { role, can_invite: false })).code;
    await call(user, null, "join", { code });
  }
  const data = await bootstrap(owner);
  members = Object.fromEntries(data.members.map((m) => [m.role, m.id]));
  const m = await call(owner, profile, "save_medication", input());
  medication = (await bootstrap(owner)).medications.find((md) => md.id === m.id)!;
});

describe("Authentication and invitation security", () => {
  it("uses persistent random sessions and rejects invented tokens", async () => {
    const token = await createLocalSession(owner.id);
    expect(token.length).toBeGreaterThan(30);
    expect((await userFromLocalSession(token))?.id).toBe(owner.id);
    expect(await userFromLocalSession("made-up-token")).toBeNull();
  });
  it("stores invitation hashes, accepts once, rejects reuse and expired codes", async () => {
    const fresh = await createLocalUser("new@test.invalid", "New Member", "Long-Test-Password1!");
    const invite = await call(owner, profile, "invite", { role: "viewer", can_invite: false });
    const db = await localDb();
    const stored = await db.query<{ code_hash: string }>(
      "select code_hash from invitations where id=$1",
      [invite.id],
    );
    expect(stored.rows[0].code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.rows[0].code_hash).not.toBe(invite.code);
    const joined = await call(fresh, null, "join", { code: invite.code });
    expect(joined.id).toBe(profile);
    expect((await call(fresh, null, "join", { code: invite.code })).code).toBe(
      "invalid_invitation",
    );
    const expired = await call(owner, profile, "invite", { role: "caretaker", can_invite: false });
    await db.query("update invitations set expires_at=now()-interval '1 minute' where id=$1", [
      expired.id,
    ]);
    expect((await call(stranger, null, "join", { code: expired.code })).code).toBe(
      "invalid_invitation",
    );
    const revoked = await call(owner, profile, "invite", { role: "viewer", can_invite: false });
    await call(owner, profile, "revoke_invitation", { id: revoked.id });
    expect((await call(stranger, null, "join", { code: revoked.code })).code).toBe(
      "invalid_invitation",
    );
  });
  it("commits failed invitation attempts and rate limits brute force", async () => {
    const attacker = await createLocalUser(
      "attacker@test.invalid",
      "Attacker",
      "Long-Test-Password1!",
    );
    for (let i = 0; i < 8; i++)
      expect((await call(attacker, null, "join", { code: "NOTAVALIDCODE" })).code).toBe(
        "invalid_invitation",
      );
    expect((await call(attacker, null, "join", { code: "NOTAVALIDCODE" })).code).toBe("rate_limit");
  });
});

describe("RLS and server permission enforcement", () => {
  it("isolates profiles in RPC responses", async () => {
    await expect(bootstrap(stranger, profile)).rejects.toThrow("do not have access");
    await expect(bootstrap(owner, otherProfile)).rejects.toThrow("do not have access");
    expect((await bootstrap(stranger, otherProfile)).medications).toEqual([]);
  });
  it("enforces row policies on direct queries with authenticated database role", async () => {
    const db = await localDb();
    await db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [stranger.id]);
      await tx.exec("set local role authenticated");
      const m = await tx.query("select * from medications where profile_id=$1", [profile]);
      expect(m.rows).toHaveLength(0);
      const inv = await tx.query("select * from invitations where profile_id=$1", [profile]);
      expect(inv.rows).toHaveLength(0);
      const profiles = await tx.query<{ id: string }>("select id from elderly_profiles");
      expect(profiles.rows.map((p) => p.id)).toEqual([otherProfile]);
    });
  });
  it("blocks viewer writes and caretaker medication edits", async () => {
    await expect(call(viewer, profile, "save_medication", input())).rejects.toThrow("cannot edit");
    await expect(call(caretaker, profile, "save_medication", input())).rejects.toThrow(
      "cannot edit",
    );
    expect((await bootstrap(caretaker)).medications).toHaveLength(0);
    await expect(
      call(coordinator, profile, "invite", { role: "caretaker", can_invite: false }),
    ).rejects.toThrow("invitation permission");
  });
  it("denies direct table writes and internal definer helpers", async () => {
    const db = await localDb();
    await expect(
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [owner.id]);
        await tx.exec("set local role authenticated");
        await tx.query("update medications set dosage='hacked' where id=$1", [medication.id]);
      }),
    ).rejects.toThrow();
    await expect(
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [owner.id]);
        await tx.exec("set local role authenticated");
        await tx.query("select write_audit($1,'fake','dose',$2,'{}')", [
          otherProfile,
          randomUUID(),
        ]);
      }),
    ).rejects.toThrow();
  });
});

describe("Medication scheduling and immutable reports", () => {
  it("validates schedule inputs and preserves correct local occurrence times", async () => {
    expect(medicationSchema.safeParse({ ...input(), days: [] }).success).toBe(false);
    expect(medicationSchema.safeParse({ ...input(), times: ["25:00"] }).success).toBe(false);
    expect(medicationSchema.safeParse({ ...input(), end_date: "2000-01-01" }).success).toBe(false);
    const data = await bootstrap(owner);
    const doses = data.doses.filter((d) => d.medication_id === medication.id);
    expect(doses.length).toBe(16);
    expect(
      doses.every((d) =>
        ["08:00", "20:00"].includes(formatInTimeZone(d.scheduled_at, "Asia/Kolkata", "HH:mm")),
      ),
    ).toBe(true);
  });
  it("saves the previous instructions and protects historical dose snapshots", async () => {
    const db = await localDb();
    const old = (await bootstrap(owner)).doses.find((d) => d.medication_id === medication.id)!;
    await db.query("update dose_events set scheduled_at=now()-interval '2 hours' where id=$1", [
      old.id,
    ]);
    await call(owner, profile, "dose_status", {
      id: old.id,
      expected_version: old.version,
      status: "self_reported_taken",
      note: "Synthetic report",
    });
    await call(coordinator, profile, "save_medication", {
      ...input(),
      id: medication.id,
      expected_version: 1,
      instructions: "Updated recorded fictional instructions",
      reason: "New fictional source",
      source: "Fictional clinician update",
      responsible_member_id: members.coordinator,
    });
    const updated = await bootstrap(owner);
    expect(
      updated.versions.find((v) => v.medication_id === medication.id)?.snapshot.instructions,
    ).toBe("Recorded fictional prescription");
    expect(updated.doses.find((d) => d.id === old.id)?.snapshot.instructions).toBe(
      "Recorded fictional prescription",
    );
    expect(updated.doses.find((d) => d.id === old.id)?.status).toBe("self_reported_taken");
    medication = updated.medications.find((m) => m.id === medication.id)!;
    expect(medication.version).toBe(2);
  });
  it("rejects stale dose updates and distinguishes unconfirmed from missed", async () => {
    const db = await localDb();
    const dose = (await bootstrap(owner)).doses.find((d) => d.status === "scheduled")!;
    await db.query("update dose_events set scheduled_at=now()-interval '3 hours' where id=$1", [
      dose.id,
    ]);
    await call(owner, profile, "dose_status", {
      id: dose.id,
      expected_version: dose.version,
      status: "unconfirmed",
      note: "Not sure",
    });
    await expect(
      call(coordinator, profile, "dose_status", {
        id: dose.id,
        expected_version: dose.version,
        status: "explicitly_missed",
        note: "",
      }),
    ).rejects.toThrow("already updated");
    const fresh = (await bootstrap(owner)).doses.find((d) => d.id === dose.id)!;
    expect(fresh.status).toBe("unconfirmed");
    expect((await bootstrap(owner)).notifications.some((n) => n.kind === "dose_missed")).toBe(
      false,
    );
    await call(coordinator, profile, "dose_status", {
      id: dose.id,
      expected_version: fresh.version,
      status: "explicitly_missed",
      note: "Explicit fictional report",
    });
    expect((await bootstrap(owner)).notifications.some((n) => n.kind === "dose_missed")).toBe(true);
    const a = (await bootstrap(owner)).audit.filter((a) => a.entity_id === dose.id);
    expect(
      a.some(
        (e) =>
          e.details.previous_status === "unconfirmed" &&
          e.details.new_status === "explicitly_missed",
      ),
    ).toBe(true);
  });
});

describe("Care handoff transaction", () => {
  let assignmentId: string, doseId: string;
  it("retains current responsibility until acceptance and limits recipient access", async () => {
    const data = await bootstrap(owner);
    const dose = data.doses.find(
      (d) => d.status === "scheduled" && d.assigned_member_id === members.coordinator,
    )!;
    doseId = dose.id;
    assignmentId = String(
      (
        await call(coordinator, profile, "handoff", {
          dose_event_id: doseId,
          appointment_id: null,
          title: "Fictional handoff",
          to_member_id: members.caretaker,
          due_at: dose.scheduled_at,
          note: "Please help",
        })
      ).id,
    );
    const pending = (await bootstrap(owner)).assignments.find((a) => a.id === assignmentId)!;
    expect(pending.current_owner_id).toBe(members.coordinator);
    expect(pending.proposed_owner_id).toBe(members.caretaker);
    expect((await bootstrap(caretaker)).doses.some((d) => d.id === doseId)).toBe(true);
    expect((await bootstrap(caretaker)).medications.some((m) => m.id === medication.id)).toBe(true);
    await expect(
      call(caretaker, profile, "dose_status", {
        id: doseId,
        expected_version: dose.version,
        status: "assisted_recorded",
        note: "",
      }),
    ).rejects.toThrow("current assigned caretaker");
    await expect(
      call(owner, profile, "handoff_response", {
        id: assignmentId,
        expected_version: 1,
        accept: true,
        note: "",
      }),
    ).rejects.toThrow("Only the invited task recipient");
  });
  it("accepts atomically and rejects a concurrent stale response", async () => {
    const results = await Promise.allSettled([
      call(caretaker, profile, "handoff_response", {
        id: assignmentId,
        expected_version: 1,
        accept: true,
        note: "Accepted",
      }),
      call(caretaker, profile, "handoff_response", {
        id: assignmentId,
        expected_version: 1,
        accept: false,
        note: "Competing update",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const data = await bootstrap(owner);
    const a = data.assignments.find((a) => a.id === assignmentId)!;
    expect(a.current_owner_id).toBe(members.caretaker);
    expect(a.previous_owner_id).toBe(members.coordinator);
    expect(a.proposed_owner_id).toBeNull();
    expect(data.doses.find((d) => d.id === doseId)?.assigned_member_id).toBe(members.caretaker);
    expect(
      data.audit.some(
        (e) => e.entity_id === assignmentId && e.action === "Accepted a care handoff",
      ),
    ).toBe(true);
  });
  it("completion does not imply ingestion and dose reports resolve tasks", async () => {
    const db = await localDb();
    const data = await bootstrap(owner);
    const d = data.doses.find((d) => d.id === doseId)!;
    await expect(
      call(caretaker, profile, "complete_task", {
        id: assignmentId,
        expected_version: 2,
        note: "Done",
      }),
    ).rejects.toThrow("Record the dose status first");
    await db.query("update dose_events set scheduled_at=now()-interval '10 minutes' where id=$1", [
      doseId,
    ]);
    await call(caretaker, profile, "dose_status", {
      id: doseId,
      expected_version: d.version,
      status: "assisted_recorded",
      note: "Fictional assistance report",
    });
    expect((await bootstrap(owner)).assignments.find((a) => a.id === assignmentId)?.status).toBe(
      "completed",
    );
  });
  it("a declined handoff leaves the prior responsibility unchanged", async () => {
    const a = await call(coordinator, profile, "handoff", {
      title: "Fictional general task",
      to_member_id: members.caretaker,
      due_at: new Date().toISOString(),
      note: "Can you help?",
    });
    await call(caretaker, profile, "handoff_response", {
      id: a.id,
      expected_version: 1,
      accept: false,
      note: "Unavailable",
    });
    const declined = (await bootstrap(owner)).assignments.find((t) => t.id === a.id)!;
    expect(declined.status).toBe("declined");
    expect(declined.current_owner_id).toBeNull();
  });
});

describe("Appointment and email reminders", () => {
  it("saves appointments and rejects cross-profile responsible members", async () => {
    const a = {
      doctor_name: "Fictional Doctor",
      specialty: "General",
      starts_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      clinic: "Test Clinic",
      location: "Fictional",
      notes: "Synthetic",
      accompanying_member_id: members.caretaker,
      status: "upcoming",
      follow_up_notes: "",
    };
    await expect(call(viewer, profile, "save_appointment", a)).rejects.toThrow(
      "cannot manage appointments",
    );
    const otherMember = (await bootstrap(stranger, otherProfile)).membership!.id;
    await expect(
      call(owner, profile, "save_appointment", { ...a, accompanying_member_id: otherMember }),
    ).rejects.toThrow("active authorised");
    await call(owner, profile, "save_appointment", a);
    expect(
      (await bootstrap(caretaker)).appointments.some((x) => x.doctor_name === "Fictional Doctor"),
    ).toBe(true);
  });
  it("generates unique reminders and never infers a missed dose", async () => {
    const db = await localDb();
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.query("select collect_profile_reminders($1)", [profile]);
    const before = await db.query<{ count: number }>(
      "select count(*)::integer as count from notifications where kind<>'reminder_test'",
    );
    await db.query("select collect_profile_reminders($1)", [profile]);
    const after = await db.query<{ count: number }>(
      "select count(*)::integer as count from notifications where kind<>'reminder_test'",
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
    const reminders = await db.query<{ kind: string; body: string }>(
      "select kind,body from notifications where kind in('dose_unconfirmed','dose_escalation','appointment_reminder')",
    );
    expect(reminders.rows.some((n) => n.kind === "appointment_reminder")).toBe(true);
    const unresolved = await db.query<Dose>(
      "select * from dose_events where scheduled_at<now() and status='unconfirmed'",
    );
    expect(unresolved.rows.every((d) => d.status !== "explicitly_missed")).toBe(true);
  });
  it("respects notification preferences and worker authentication", async () => {
    const db = await localDb();
    await db.query("update care_members set email_enabled=false where id=$1", [members.viewer]);
    await db.query(
      "select enqueue_notification($1,$2,'medication_changed','Test','Body','disabled-test')",
      [profile, viewer.id],
    );
    const n = await db.query("select * from notifications where idempotency_key='disabled-test'");
    expect(n.rows).toHaveLength(0);
    await expect(
      localRpc(null, "care_worker", ["wrong-secret-that-is-at-least-32-characters", "claim", {}]),
    ).rejects.toThrow("Worker authorization failed");
  });
  it("revocation blocks further access and preserves historical membership", async () => {
    await call(owner, profile, "remove_member", { id: members.caretaker });
    await expect(bootstrap(caretaker)).rejects.toThrow("do not have access");
    const data = await bootstrap(owner);
    expect(data.members.find((m) => m.id === members.caretaker)?.active).toBe(false);
    expect(data.audit.some((a) => a.action === "Removed a care circle member")).toBe(true);
    await expect(call(owner, profile, "remove_member", { id: members.owner })).rejects.toThrow(
      "must retain access",
    );
  });
});
