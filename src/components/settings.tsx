"use client";
import { useState } from "react";
import { Mail, Clock, ShieldCheck, Send, CheckCircle2, Globe, User, Info } from "lucide-react";
import { useCare } from "./care-provider";
import { PageHeading } from "./page-heading";
import { Card, Badge, Avatar } from "./ui/common";
import { Button } from "./ui/button";
import { Input, Field } from "./ui/fields";
import { canManage, roleLabels } from "@/lib/utils";
export function Settings() {
  const { data, act, busy } = useCare();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown>>();
  const manager = canManage(data.membership?.role);
  const p = data.profile!;
  const m = data.membership!;
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="Your care, your preferences"
        title="Settings & preferences"
        description="Choose the updates you want, and how your care circle follows up."
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
        <form
          className="space-y-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await act("settings", {
                grace_minutes: Number(f.get("grace_minutes") || p.grace_minutes),
                escalation_minutes: Number(f.get("escalation_minutes") || p.escalation_minutes),
                appointment_reminders: String(
                  f.get("appointment_reminders") || p.appointment_reminders.join(","),
                )
                  .split(",")
                  .map((x) => Number(x.trim())),
                email_enabled: f.get("email_enabled") === "on",
                reminder_enabled: f.get("reminder_enabled") === "on",
                updates_enabled: f.get("updates_enabled") === "on",
              });
            } catch {}
          }}
        >
          <Card>
            <div className="flex items-center gap-3 border-b border-border px-6 py-5">
              <Mail size={18} className="text-primary" />
              <div>
                <h2 className="text-sm font-semibold">Your email preferences</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  These preferences apply to your account in this care circle.
                </p>
              </div>
            </div>
            <div className="divide-y divide-border px-6">
              {[
                [
                  "email_enabled",
                  "Receive CareRelay emails",
                  "The main switch for email delivery to your account.",
                  m.email_enabled,
                ],
                [
                  "reminder_enabled",
                  "Medication and appointment reminders",
                  "Upcoming tasks, unconfirmed statuses, and appointment reminders.",
                  m.reminder_enabled,
                ],
                [
                  "updates_enabled",
                  "Important care updates",
                  "Medication changes, handoff requests and responses, and access updates.",
                  m.updates_enabled,
                ],
              ].map(([name, title, desc, checked]) => (
                <label
                  key={String(name)}
                  className="flex cursor-pointer items-center justify-between gap-4 py-5"
                >
                  <div>
                    <span className="block text-xs font-semibold">{String(title)}</span>
                    <span className="mt-1 block text-[11px] leading-6 text-muted-foreground">
                      {String(desc)}
                    </span>
                  </div>
                  <input
                    className="size-4 shrink-0"
                    name={String(name)}
                    type="checkbox"
                    defaultChecked={Boolean(checked)}
                  />
                </label>
              ))}
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3 border-b border-border px-6 py-5">
              <Clock size={18} className="text-primary" />
              <div>
                <h2 className="text-sm font-semibold">Care follow-up timing</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {manager
                    ? "Shared settings for this healthcare profile."
                    : "Managed by the profile owner or family coordinator."}
                </p>
              </div>
            </div>
            <div className="space-y-5 p-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Status grace period (minutes)"
                  hint="After a scheduled time, wait this long before asking for a status update."
                >
                  <Input
                    name="grace_minutes"
                    type="number"
                    min={5}
                    max={1440}
                    defaultValue={p.grace_minutes}
                    disabled={!manager}
                  />
                </Field>
                <Field
                  label="Escalation delay (minutes)"
                  hint="After the grace period, wait this much longer before notifying the coordinator."
                >
                  <Input
                    name="escalation_minutes"
                    type="number"
                    min={5}
                    max={2880}
                    defaultValue={p.escalation_minutes}
                    disabled={!manager}
                  />
                </Field>
              </div>
              <Field
                label="Appointment reminders (minutes before)"
                hint="Comma-separated intervals. 1440 and 60 mean 24 hours and 1 hour before."
              >
                <Input
                  name="appointment_reminders"
                  defaultValue={p.appointment_reminders.join(", ")}
                  disabled={!manager}
                />
              </Field>
              <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-[11px] leading-6 text-muted-foreground">
                <Info size={14} className="mt-1 shrink-0" />
                An overdue, unrecorded dose becomes unconfirmed. It is never automatically marked
                missed.
              </p>
            </div>
          </Card>
          <Button type="submit" disabled={busy}>
            Save preferences <CheckCircle2 size={14} />
          </Button>
        </form>
        <div className="space-y-5">
          <Card className="p-6">
            <Avatar name={data.user.name} tone={1} className="size-12 text-sm" />
            <h2 className="mt-4 text-sm font-semibold">{data.user.name}</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">{data.user.email}</p>
            <Badge className="mt-3" tone="green">
              {roleLabels[m.role]}
            </Badge>
            <div className="mt-5 space-y-3 border-t border-border pt-4">
              <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <User size={13} /> {p.preferred_name}’s care profile
              </p>
              <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Globe size={13} /> {p.timezone}
              </p>
              <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <ShieldCheck size={13} />{" "}
                {data.mode === "local" ? "Local development account" : "Supabase authentication"}
              </p>
            </div>
          </Card>
          <Card className="p-6">
            <div className="mb-3 flex items-center justify-between">
              <Mail size={21} className="text-primary" />
              <Badge tone={data.emailConfigured ? "green" : "amber"}>
                {data.emailConfigured ? "Resend configured" : "Configuration needed"}
              </Badge>
            </div>
            <h2 className="text-sm font-semibold">Try a reminder</h2>
            <p className="mt-2 text-[11px] leading-6 text-muted-foreground">
              Generate due reminders and queue a test email to your own account. The notification
              history records the actual delivery result.
            </p>
            {manager && (
              <Button
                className="mt-5 w-full"
                variant="outline"
                size="sm"
                disabled={testing || busy}
                onClick={async () => {
                  setTesting(true);
                  try {
                    const r = await act("test_reminder", {}, { silent: true });
                    setResult(r);
                  } catch {
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                <Send size={13} />
                {testing ? "Processing…" : "Run reminder test"}
              </Button>
            )}
            {!manager && (
              <p className="mt-4 text-[10px] text-muted-foreground">
                Ask the profile owner or coordinator to run a test.
              </p>
            )}
            {result && (
              <div role="status" className="mt-4 rounded-lg bg-muted p-3 text-[11px] leading-6">
                <p>
                  {Number(result.sent || 0) > 0
                    ? `${result.sent} email(s) sent.`
                    : Number(result.failed || 0) > 0
                      ? `${result.failed} email(s) failed. Review Notifications for the recorded error.`
                      : result.unconfigured
                        ? "No email sent. Email or worker configuration is missing."
                        : String(result.message || "Test processed.")}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Generated: {String(result.generated || 0)} · Sent: {String(result.sent || 0)} ·
                  Failed: {String(result.failed || 0)}
                </p>
              </div>
            )}
          </Card>
          <p className="px-1 text-[10px] leading-6 text-muted-foreground">
            CareRelay supports medication management and coordination. It does not prescribe,
            diagnose, recommend dosage changes, or verify ingestion. Confirm unclear instructions
            with your healthcare professional.
          </p>
        </div>
      </div>
    </div>
  );
}
