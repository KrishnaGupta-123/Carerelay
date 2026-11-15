export type Role = "owner" | "coordinator" | "caretaker" | "viewer";
export type DoseStatus = "scheduled" | "self_reported_taken" | "assisted_recorded" | "declined" | "needs_help" | "unconfirmed" | "explicitly_missed";
export interface User { id: string; email: string; name: string; authMode?: "local" | "supabase"; }
export interface CareProfile {
  id: string; owner_id: string; preferred_name: string; date_of_birth: string | null;
  timezone: string; notes: string; grace_minutes: number; escalation_minutes: number;
  appointment_reminders: number[]; created_at: string;
}
export interface Member {
  id: string; profile_id: string; user_id: string; role: Role; can_invite: boolean;
  active: boolean; joined_at: string; name: string; email: string;
  email_enabled: boolean; reminder_enabled: boolean; updates_enabled: boolean;
}
export interface Medication {
  id: string; profile_id: string; name: string; strength: string; dosage: string;
  form: string; route: string; instructions: string; source: string;
  start_date: string; end_date: string | null; state: "active" | "paused" | "completed";
  responsible_member_id: string | null; entered_by: string; created_at: string;
  updated_at: string; version: number; flagged: boolean; flag_note: string;
  schedule: { times: string[]; days: number[]; reminder_minutes: number; reminders_enabled: boolean };
}
export interface Dose {
  id: string; profile_id: string; medication_id: string; scheduled_at: string;
  status: DoseStatus; snapshot: { name: string; strength: string; dosage: string; instructions: string; source: string; version: number };
  assigned_member_id: string | null; reported_by: string | null; recorded_at: string | null;
  note: string; version: number; created_at: string;
}
export interface Assignment {
  id: string; profile_id: string; dose_event_id: string | null; appointment_id: string | null;
  title: string; current_owner_id: string | null; previous_owner_id: string | null;
  proposed_owner_id: string | null; initiated_by: string; status: "open" | "pending" | "accepted" | "declined" | "completed";
  note: string; due_at: string; version: number; created_at: string; updated_at: string;
}
export interface Appointment {
  id: string; profile_id: string; doctor_name: string; specialty: string; starts_at: string;
  clinic: string; location: string; notes: string; accompanying_member_id: string | null;
  status: "upcoming" | "completed" | "cancelled"; follow_up_notes: string; version: number;
  created_by: string; created_at: string; updated_at: string;
}
export interface Audit {
  id: string; profile_id: string; actor_id: string | null; actor_name: string;
  action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: string;
}
export interface Invitation {
  id: string; role: Role; can_invite: boolean; expires_at: string; consumed_at: string | null;
  revoked_at: string | null; invited_by: string; created_at: string;
}
export interface MedicationVersion {
  id: string; medication_id: string; version: number; snapshot: Medication; changed_by: string;
  actor_name: string; reason: string; source: string; created_at: string;
}
export interface Notification {
  id: string; profile_id: string; user_id: string; kind: string; subject: string;
  body: string; status: "queued" | "processing" | "sent" | "failed" | "unconfigured";
  read_at: string | null; created_at: string; sent_at: string | null; error: string | null; attempts: number;
}
export interface CareData {
  user: User; profiles: (CareProfile & { role: Role })[]; profile: CareProfile | null;
  membership: Member | null; members: Member[]; medications: Medication[]; doses: Dose[];
  assignments: Assignment[]; appointments: Appointment[]; audit: Audit[];
  invitations: Invitation[]; versions: MedicationVersion[]; notifications: Notification[];
  mode: "supabase" | "local"; emailConfigured: boolean;
}
