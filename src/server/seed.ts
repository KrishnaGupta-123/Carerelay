import "server-only";
import { localDb, createLocalUser, localRpc } from "./local-db";
import { demoAccounts, seedCareScenario } from "./demo-scenario";
import type { CareData, User } from "@/lib/types";

export { demoAccounts } from "./demo-scenario";

export async function seedLocal(password: string) {
  const db = await localDb();
  const existing = await db.query<{ id: string }>("select id from users where email=$1", [
    demoAccounts[0].email,
  ]);
  if (existing.rows.length)
    return { created: false, message: "Demo accounts already exist; existing data was preserved." };
  const users: User[] = [];
  for (const account of demoAccounts)
    users.push(await createLocalUser(account.email, account.name, password));
  const profileId = await seedCareScenario({
    action: (actor, profile, kind, payload) =>
      localRpc<Record<string, unknown>>(users[actor].id, "care_action", [profile, kind, payload]),
    bootstrap: (actor, profile) => localRpc<CareData>(users[actor].id, "care_bootstrap", [profile]),
  });
  return {
    created: true,
    profileId,
    message: "Synthetic care circle created. Log in using an individual demo account.",
  };
}
