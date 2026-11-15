"use client";
import { useState } from "react";
import type { Assignment, Dose, Appointment } from "@/lib/types";
import { useCare } from "./care-provider";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input, Field, Select, Textarea } from "./ui/fields";
import { Button } from "./ui/button";
import { localTime, prettyDate, shortName } from "@/lib/utils";
export function HandoffForm({
  open,
  onOpenChange,
  assignment,
  dose,
  appointment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment?: Assignment;
  dose?: Dose;
  appointment?: Appointment;
}) {
  const { data, act, busy } = useCare();
  const [linked, setLinked] = useState(
    dose ? `dose:${dose.id}` : appointment ? `appointment:${appointment.id}` : "",
  );
  const selectedDose = data.doses.find((d) => `dose:${d.id}` === linked);
  const current =
    assignment?.current_owner_id || dose?.assigned_member_id || appointment?.accompanying_member_id;
  const available = data.members.filter((m) => m.active && m.role !== "viewer" && m.id !== current);
  const tz = data.profile?.timezone;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>
          {assignment ? "Transfer a responsibility" : "Arrange a care handoff"}
        </DialogTitle>
        <DialogDescription>
          Ask an authorised member to take over. The current person stays responsible until the
          recipient accepts.
        </DialogDescription>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const linkedDose = data.doses.find((d) => `dose:${d.id}` === linked);
            const linkedAppt = data.appointments.find((a) => `appointment:${a.id}` === linked);
            try {
              await act("handoff", {
                ...(assignment ? { id: assignment.id, expected_version: assignment.version } : {}),
                title: f.get("title"),
                dose_event_id: assignment?.dose_event_id || linkedDose?.id || null,
                appointment_id: assignment?.appointment_id || linkedAppt?.id || null,
                to_member_id: f.get("member"),
                due_at:
                  assignment?.due_at ||
                  linkedDose?.scheduled_at ||
                  linkedAppt?.starts_at ||
                  new Date().toISOString(),
                note: f.get("note"),
              });
              onOpenChange(false);
            } catch {}
          }}
        >
          {!assignment && !dose && !appointment && (
            <Field label="Link to a scheduled task (optional)">
              <Select value={linked} onChange={(e) => setLinked(e.target.value)}>
                <option value="">General care task</option>
                {data.doses
                  .filter(
                    (d) =>
                      ["scheduled", "unconfirmed", "needs_help"].includes(d.status) &&
                      !data.assignments.some((a) => a.dose_event_id === d.id),
                  )
                  .slice(0, 35)
                  .map((d) => (
                    <option key={d.id} value={`dose:${d.id}`}>
                      {d.snapshot.name} · {localTime(d.scheduled_at, tz)} ·{" "}
                      {prettyDate(d.scheduled_at, tz, "d MMM yyyy")}
                    </option>
                  ))}
                {data.appointments
                  .filter(
                    (a) =>
                      a.status === "upcoming" &&
                      !data.assignments.some((t) => t.appointment_id === a.id),
                  )
                  .map((a) => (
                    <option key={a.id} value={`appointment:${a.id}`}>
                      {a.doctor_name} · Appointment
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <Field label="Task title" required>
            <Input
              key={linked}
              name="title"
              required
              defaultValue={
                assignment?.title ||
                (dose
                  ? `Help with ${dose.snapshot.name}`
                  : appointment
                    ? `Accompany ${data.profile?.preferred_name} to ${appointment.doctor_name}`
                    : selectedDose
                      ? `Help with ${selectedDose.snapshot.name}`
                      : "")
              }
              placeholder="What would you like help with?"
            />
          </Field>
          {current && (
            <p className="rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
              Currently responsible:{" "}
              <strong className="text-foreground">
                {data.members.find((m) => m.id === current)?.name || "Unassigned"}
              </strong>
            </p>
          )}
          <Field label="Ask a care circle member" required>
            <Select name="member" required defaultValue="">
              <option value="" disabled>
                Choose a member
              </option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Handoff note">
            <Textarea
              name="note"
              defaultValue={assignment?.note || ""}
              placeholder="Share the context they need to help."
            />
          </Field>
          <p className="text-xs leading-6 text-muted-foreground">
            {shortName(data.profile?.preferred_name)} and the care coordinator can see the handoff
            history. The recipient gets an email notification when delivery is configured.
          </p>
          <Button type="submit" className="w-full" disabled={busy || available.length === 0}>
            {busy ? "Sending request…" : "Request handoff"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
