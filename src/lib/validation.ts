import { z } from "zod";
const uuid = z.string().uuid();
const text = (max = 1000) => z.string().trim().max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const roleSchema = z.enum(["coordinator", "caretaker", "viewer"]);
export const medicationSchema = z.object({
  id: uuid.optional(), expected_version: z.number().int().positive().optional(),
  name: text(120).min(1, "Enter a medication name"), strength: text(100), dosage: text(250).min(1, "Enter the recorded dosage"),
  form: z.enum(["tablet", "capsule", "liquid", "injection", "drops", "inhaler", "other"]),
  route: text(100), instructions: text(2000), source: text(250).min(1, "Record where these instructions came from"),
  start_date: date, end_date: date.nullable(), times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(12).transform(v => [...new Set(v)].sort()),
  days: z.array(z.number().int().min(0).max(6)).min(1).transform(v => [...new Set(v)].sort()),
  reminder_minutes: z.number().int().min(0).max(1440), reminders_enabled: z.boolean(),
  responsible_member_id: uuid.nullable(), reason: text(1000).optional(),
}).refine(v => !v.end_date || v.end_date >= v.start_date, { path: ["end_date"], message: "End date must be on or after the start date" })
  .refine(v => !v.id || !!v.reason?.trim(), { path: ["reason"], message: "Record the reason for this change" });
export const appointmentSchema = z.object({
  id: uuid.optional(), expected_version: z.number().int().positive().optional(),
  doctor_name: text(150).min(1), specialty: text(150), starts_at: z.string().datetime(),
  clinic: text(200).min(1), location: text(300), notes: text(2000), accompanying_member_id: uuid.nullable(),
  status: z.enum(["upcoming", "completed", "cancelled"]), follow_up_notes: text(2000),
});
export const doseStatusSchema = z.object({
  id: uuid, expected_version: z.number().int().positive(),
  status: z.enum(["self_reported_taken", "assisted_recorded", "declined", "needs_help", "unconfirmed", "explicitly_missed"]),
  note: text(1000).default(""),
});
export const assignmentSchema = z.object({
  id: uuid.optional(), dose_event_id: uuid.nullable().optional(), appointment_id: uuid.nullable().optional(),
  title: text(200).min(1), to_member_id: uuid, due_at: z.string().datetime(),
  note: text(1000), expected_version: z.number().int().positive().optional(),
});
export const profileSchema = z.object({ preferred_name: text(100).min(1), timezone: text(100).refine(v => { try { Intl.DateTimeFormat("en", {timeZone:v}); return true; } catch { return false; } }, "Choose a valid timezone"), date_of_birth: date.nullable(), notes: text(2000).default("") });
export const settingsSchema = z.object({
  grace_minutes: z.number().int().min(5).max(1440), escalation_minutes: z.number().int().min(5).max(2880),
  appointment_reminders: z.array(z.number().int().min(0).max(10080)).min(1).max(4),
  email_enabled: z.boolean(), reminder_enabled: z.boolean(), updates_enabled: z.boolean(),
});
export const actionSchemas: Record<string, z.ZodType> = {
  create_profile: profileSchema,
  save_medication: medicationSchema,
  medication_state: z.object({ id: uuid, state: z.enum(["active", "paused", "completed"]), reason: text(1000).min(1), expected_version: z.number().int().positive() }),
  flag_medication: z.object({ id: uuid, note: text(1000).min(1), expected_version: z.number().int().positive() }),
  dose_status: doseStatusSchema,
  save_appointment: appointmentSchema,
  delete_appointment: z.object({ id: uuid, expected_version: z.number().int().positive() }),
  handoff: assignmentSchema,
  handoff_response: z.object({ id: uuid, accept: z.boolean(), note: text(1000), expected_version: z.number().int().positive() }),
  complete_task: z.object({ id: uuid, note: text(1000), expected_version: z.number().int().positive() }),
  task_help: z.object({ id: uuid, note: text(1000).min(1), expected_version: z.number().int().positive() }),
  invite: z.object({ role: roleSchema, can_invite: z.boolean().default(false) }),
  join: z.object({ code: z.string().trim().min(8).max(80) }),
  revoke_invitation: z.object({ id: uuid }),
  remove_member: z.object({ id: uuid }),
  request_help: z.object({ note: text(1000).min(1) }),
  settings: settingsSchema,
  notification_read: z.object({ id: uuid.optional(), all: z.boolean().optional() }),
};
