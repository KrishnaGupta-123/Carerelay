"use client";
import type { Appointment } from "@/lib/types";
import { useCare } from "./care-provider";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input, Field, Select, Textarea } from "./ui/fields";
import { Button } from "./ui/button";
import { localDate, appointmentISO } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
export function AppointmentForm({
  open,
  onOpenChange,
  appointment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: Appointment;
}) {
  const { data, now, act, busy } = useCare();
  const tz = data.profile?.timezone || "Asia/Kolkata";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{appointment ? "Update appointment" : "Add an appointment"}</DialogTitle>
        <DialogDescription>
          Keep the appointment details and accompanying person clear for everyone with access. Times
          are in {tz}.
        </DialogDescription>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await act("save_appointment", {
                ...(appointment
                  ? { id: appointment.id, expected_version: appointment.version }
                  : {}),
                doctor_name: f.get("doctor_name"),
                specialty: f.get("specialty"),
                clinic: f.get("clinic"),
                location: f.get("location"),
                starts_at: appointmentISO(String(f.get("date")), String(f.get("time")), tz),
                notes: f.get("notes"),
                accompanying_member_id: f.get("member") || null,
                status: f.get("status") || "upcoming",
                follow_up_notes: f.get("follow_up_notes") || "",
              });
              onOpenChange(false);
            } catch {}
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Doctor’s name" required>
              <Input
                name="doctor_name"
                required
                placeholder="Dr. …"
                defaultValue={appointment?.doctor_name}
              />
            </Field>
            <Field label="Specialty">
              <Input
                name="specialty"
                placeholder="e.g. General medicine"
                defaultValue={appointment?.specialty}
              />
            </Field>
            <Field label="Date" required>
              <Input
                type="date"
                name="date"
                required
                defaultValue={
                  appointment ? localDate(appointment.starts_at, tz) : localDate(now, tz)
                }
              />
            </Field>
            <Field label="Time" required>
              <Input
                type="time"
                name="time"
                required
                defaultValue={
                  appointment ? formatInTimeZone(appointment.starts_at, tz, "HH:mm") : "10:30"
                }
              />
            </Field>
          </div>
          <Field label="Hospital or clinic" required>
            <Input
              name="clinic"
              required
              defaultValue={appointment?.clinic}
              placeholder="Clinic name"
            />
          </Field>
          <Field label="Location">
            <Input
              name="location"
              defaultValue={appointment?.location}
              placeholder="Address or directions"
            />
          </Field>
          <Field label="Accompanying person">
            <Select name="member" defaultValue={appointment?.accompanying_member_id || ""}>
              <option value="">Not yet assigned</option>
              {data.members
                .filter((m) => m.active && m.role !== "viewer")
                .map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Appointment notes">
            <Textarea
              name="notes"
              defaultValue={appointment?.notes}
              placeholder="What would you like the care circle to know?"
            />
          </Field>
          {appointment && (
            <>
              <Field label="Status">
                <Select name="status" defaultValue={appointment.status}>
                  <option value="upcoming">Upcoming</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </Field>
              <Field label="Follow-up notes">
                <Textarea
                  name="follow_up_notes"
                  defaultValue={appointment.follow_up_notes}
                  placeholder="Record the follow-up information provided."
                />
              </Field>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save appointment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
