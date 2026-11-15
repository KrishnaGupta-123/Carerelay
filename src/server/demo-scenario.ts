import "server-only";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import type { CareData } from "@/lib/types";

export const demoAccounts = [
  { email: "meera@carerelay.demo", name: "Meera Sharma", role: "owner" },
  { email: "ananya@carerelay.demo", name: "Ananya Sharma", role: "coordinator" },
  { email: "arjun@carerelay.demo", name: "Arjun Sharma", role: "caretaker" },
  { email: "priya@carerelay.demo", name: "Priya Sharma", role: "viewer" },
] as const;

interface DemoTransport {
  action: (
    actor: number,
    profile: string | null,
    kind: string,
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  bootstrap: (actor: number, profile: string) => Promise<CareData>;
}

// Both seeds exercise the same authenticated care operations as the application.
export async function seedCareScenario(transport: DemoTransport) {
  const action = async (
    actor: number,
    profile: string | null,
    kind: string,
    payload: Record<string, unknown>,
  ) => {
    const result = await transport.action(actor, profile, kind, payload);
    if (result.error) throw new Error(String(result.error));
    return result;
  };
  const profile = await action(0, null, "create_profile", {
    preferred_name: "Meera",
    timezone: "Asia/Kolkata",
    date_of_birth: "1952-03-18",
    notes:
      "Fictional demonstration profile. Prefers a calm morning routine and taking part in her own care decisions.",
  });
  const profileId = String(profile.id);
  for (let i = 1; i < demoAccounts.length; i++) {
    const invitation = await action(0, profileId, "invite", {
      role: demoAccounts[i].role,
      can_invite: i === 1,
    });
    await action(i, null, "join", { code: invitation.code });
  }
  const initial = await transport.bootstrap(0, profileId);
  const members = Object.fromEntries(initial.members.map((member) => [member.role, member.id]));
  const now = new Date();
  const today = formatInTimeZone(now, "Asia/Kolkata", "yyyy-MM-dd");
  // Two sample reports are scheduled at the current minute so the normal
  // future-dose safeguard remains in force, even when seeding before breakfast.
  const reportTime = formatInTimeZone(now, "Asia/Kolkata", "HH:mm");
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 30);
  const base = {
    strength: "",
    dosage: "1 tablet",
    form: "tablet",
    route: "Oral",
    instructions: "Follow the recorded fictional prescription instructions.",
    source: "Fictional clinician prescription — demonstration only",
    start_date: start.toISOString().slice(0, 10),
    end_date: null,
    times: ["08:00"],
    days: [0, 1, 2, 3, 4, 5, 6],
    reminder_minutes: 15,
    reminders_enabled: true,
    responsible_member_id: members.coordinator,
  };
  const medications: Record<string, unknown>[] = [];
  for (const item of [
    {
      name: "Amlodipine",
      strength: "5 mg",
      instructions: "Take with a glass of water. Recorded from the fictional prescription.",
      times: [reportTime],
    },
    {
      name: "Metformin",
      strength: "500 mg",
      instructions: "Take after a meal, as recorded in the fictional prescription.",
      times: ["08:30", "20:00"],
    },
    {
      name: "Vitamin D3",
      strength: "1,000 IU",
      instructions: "Take after breakfast, as recorded in the fictional prescription.",
      times: [reportTime],
    },
    {
      name: "Atorvastatin",
      strength: "10 mg",
      instructions: "Take at the recorded evening time. Fictional demonstration instructions.",
      times: ["21:00"],
    },
  ])
    medications.push(await action(0, profileId, "save_medication", { ...base, ...item }));

  const data = await transport.bootstrap(0, profileId);
  const changed = data.medications.find((medication) => medication.id === medications[1].id)!;
  await action(0, profileId, "save_medication", {
    ...changed,
    ...changed.schedule,
    expected_version: changed.version,
    instructions:
      "Take after the morning and evening meals, as recorded in the updated fictional prescription.",
    reason: "Added the meal timing from the fictional discharge note.",
    source: "Fictional discharge note — Dr. R. Kapoor",
  });
  const at = (time: string) => fromZonedTime(`${today}T${time}:00`, "Asia/Kolkata").toISOString();
  for (const [medicationId, status, note] of [
    [medications[0].id, "self_reported_taken", "Fictional self-report for demonstration"],
    [
      medications[2].id,
      "unconfirmed",
      "Status has not yet been confirmed; this does not mean missed.",
    ],
  ]) {
    const dose = data.doses.find(
      (dose) =>
        dose.medication_id === medicationId &&
        new Date(dose.scheduled_at).getTime() === new Date(at(reportTime)).getTime(),
    );
    if (!dose) throw new Error("The fictional dose occurrence was not generated.");
    await action(0, profileId, "dose_status", {
      id: dose.id,
      expected_version: dose.version,
      status,
      note,
    });
  }
  const updated = await transport.bootstrap(0, profileId);
  const pendingDose = updated.doses.find(
    (dose) =>
      dose.medication_id === medications[1].id &&
      new Date(dose.scheduled_at).getTime() === new Date(at("20:00")).getTime(),
  );
  if (!pendingDose) throw new Error("The fictional evening occurrence was not generated.");
  await action(1, profileId, "handoff", {
    dose_event_id: pendingDose.id,
    title: "Help with the evening medication",
    to_member_id: members.caretaker,
    due_at: pendingDose.scheduled_at,
    note: "I will be at work this evening. Could you help Meera with her recorded medication routine?",
  });
  const completed = await action(0, profileId, "handoff", {
    title: "Collect the appointment documents",
    to_member_id: members.coordinator,
    due_at: at("10:00"),
    note: "Please bring the recorded medication list to the next appointment.",
  });
  await action(1, profileId, "handoff_response", {
    id: completed.id,
    accept: true,
    note: "I will prepare the appointment documents.",
    expected_version: 1,
  });
  await action(1, profileId, "handoff", {
    id: completed.id,
    title: "Collect the appointment documents",
    to_member_id: members.caretaker,
    due_at: at("10:00"),
    note: "Please collect the documents I prepared.",
    expected_version: 2,
  });
  await action(2, profileId, "handoff_response", {
    id: completed.id,
    accept: true,
    note: "I can bring the documents.",
    expected_version: 3,
  });
  await action(2, profileId, "complete_task", {
    id: completed.id,
    note: "Documents collected and kept ready.",
    expected_version: 4,
  });
  const appointmentDay = new Date(`${today}T00:00:00Z`);
  appointmentDay.setUTCDate(appointmentDay.getUTCDate() + 2);
  await action(0, profileId, "save_appointment", {
    doctor_name: "Dr. R. Kapoor",
    specialty: "General medicine",
    starts_at: fromZonedTime(
      `${appointmentDay.toISOString().slice(0, 10)}T10:30:00`,
      "Asia/Kolkata",
    ).toISOString(),
    clinic: "Greenview Family Clinic",
    location: "Fictional clinic — demonstration only",
    notes: "Routine follow-up. Bring the current recorded medication list.",
    accompanying_member_id: members.coordinator,
    status: "upcoming",
    follow_up_notes: "",
  });
  return profileId;
}
