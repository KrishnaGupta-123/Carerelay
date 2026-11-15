import { beforeAll, describe, expect, it } from "vitest";
import { seedLocal, demoAccounts } from "@/server/seed";
import { localDb, localRpc, localLogin } from "@/server/local-db";
import type { CareData } from "@/lib/types";

process.env.CARERELAY_TEST_DB = "memory://";
process.env.LOCAL_DEVELOPMENT_MODE = "true";
const password = "Fictional-Seed-Password1!";
let profileId: string;
let ownerId: string;
beforeAll(async () => {
  const result = await seedLocal(password);
  profileId = result.profileId!;
  ownerId = (await localLogin(demoAccounts[0].email, password)).id;
});
describe("Complete fictional demonstration", () => {
  it("seeds care records through authenticated operations with both handoff states and instruction history", async () => {
    const data = await localRpc<CareData>(ownerId, "care_bootstrap", [profileId]);
    expect(data.members.map((member) => member.role).sort()).toEqual([
      "caretaker",
      "coordinator",
      "owner",
      "viewer",
    ]);
    expect(data.medications).toHaveLength(4);
    expect(data.doses.length).toBeGreaterThanOrEqual(5);
    expect(data.doses.some((dose) => dose.status === "self_reported_taken")).toBe(true);
    expect(data.doses.some((dose) => dose.status === "unconfirmed")).toBe(true);
    expect(data.doses.some((dose) => dose.status === "explicitly_missed")).toBe(false);
    expect(data.assignments.some((assignment) => assignment.status === "pending")).toBe(true);
    const completed = data.assignments.find((assignment) => assignment.status === "completed")!;
    expect(completed.current_owner_id).toBe(
      data.members.find((member) => member.role === "caretaker")!.id,
    );
    expect(completed.previous_owner_id).toBe(
      data.members.find((member) => member.role === "coordinator")!.id,
    );
    expect(data.versions).toHaveLength(1);
    expect(data.versions[0].snapshot.instructions).toContain("after a meal");
    expect(data.appointments).toHaveLength(1);
    expect(new Date(data.appointments[0].starts_at).getTime()).toBeGreaterThan(Date.now());
    expect(data.audit.some((event) => event.action === "Self-reported a dose as taken")).toBe(true);
    const caretaker = await localLogin(demoAccounts[2].email, password);
    const restricted = await localRpc<CareData>(caretaker.id, "care_bootstrap", [profileId]);
    expect(restricted.medications.map((medication) => medication.name)).toEqual(["Metformin"]);
  });
  it("preserves existing accounts and records when run again", async () => {
    expect((await seedLocal("Different-Seed-Password1!")).created).toBe(false);
    expect((await localLogin(demoAccounts[0].email, password)).id).toBe(ownerId);
    const db = await localDb();
    expect((await db.query("select id from elderly_profiles")).rows).toHaveLength(1);
    expect((await db.query("select id from medications")).rows).toHaveLength(4);
  });
});
