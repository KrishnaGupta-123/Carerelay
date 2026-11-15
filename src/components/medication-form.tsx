"use client";
import { useState } from "react";
import { Plus, X, Info } from "lucide-react";
import type { Medication } from "@/lib/types";
import { useCare } from "./care-provider";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input, Field, Select, Textarea } from "./ui/fields";
import { Button } from "./ui/button";
import { localDate } from "@/lib/utils";
export function MedicationForm({
  open,
  onOpenChange,
  medication,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medication?: Medication;
}) {
  const { data, now, act, busy } = useCare();
  const [times, setTimes] = useState(medication?.schedule.times || ["08:00"]);
  const [days, setDays] = useState(medication?.schedule.days || [0, 1, 2, 3, 4, 5, 6]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{medication ? "Update recorded medication" : "Add a medication"}</DialogTitle>
        <DialogDescription>
          Record instructions exactly as provided by your healthcare professional. CareRelay does
          not recommend medicines or dosage changes.
        </DialogDescription>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await act("save_medication", {
                ...(medication ? { id: medication.id, expected_version: medication.version } : {}),
                name: f.get("name"),
                strength: f.get("strength"),
                dosage: f.get("dosage"),
                form: f.get("form"),
                route: f.get("route"),
                instructions: f.get("instructions"),
                source: f.get("source"),
                start_date: f.get("start_date"),
                end_date: f.get("end_date") || null,
                times,
                days,
                reminder_minutes: Number(f.get("reminder_minutes")),
                reminders_enabled: f.get("reminders_enabled") === "on",
                responsible_member_id: f.get("responsible_member_id") || null,
                ...(medication ? { reason: f.get("reason") } : {}),
              });
              onOpenChange(false);
            } catch {}
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Medication name" required>
              <Input
                name="name"
                required
                placeholder="As written on the prescription"
                defaultValue={medication?.name}
              />
            </Field>
            <Field label="Strength">
              <Input name="strength" placeholder="e.g. 5 mg" defaultValue={medication?.strength} />
            </Field>
            <Field label="Recorded dosage" required>
              <Input
                name="dosage"
                required
                placeholder="e.g. 1 tablet"
                defaultValue={medication?.dosage}
              />
            </Field>
            <Field label="Form">
              <Select name="form" defaultValue={medication?.form || "tablet"}>
                {["tablet", "capsule", "liquid", "injection", "drops", "inhaler", "other"].map(
                  (f) => (
                    <option key={f} value={f}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </option>
                  ),
                )}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Route (if provided)">
              <Input name="route" placeholder="e.g. Oral" defaultValue={medication?.route} />
            </Field>
            <Field label="Instruction source" required>
              <Input
                name="source"
                required
                placeholder="Prescription, doctor, discharge note…"
                defaultValue={medication?.source}
              />
            </Field>
          </div>
          <Field label="Recorded instructions / notes">
            <Textarea
              name="instructions"
              placeholder="Record the instructions without interpreting or changing them."
              defaultValue={medication?.instructions}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" required>
              <Input
                type="date"
                name="start_date"
                required
                defaultValue={medication?.start_date || localDate(now, data.profile?.timezone)}
              />
            </Field>
            <Field label="End date (optional)">
              <Input type="date" name="end_date" defaultValue={medication?.end_date || ""} />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold">Daily administration times *</legend>
            <div className="flex flex-wrap items-center gap-2">
              {times.map((time, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    type="time"
                    aria-label={`Administration time ${i + 1}`}
                    value={time}
                    required
                    className="w-32"
                    onChange={(e) => setTimes(times.map((t, j) => (j === i ? e.target.value : t)))}
                  />
                  {times.length > 1 && (
                    <button
                      aria-label={`Remove time ${i + 1}`}
                      type="button"
                      onClick={() => setTimes(times.filter((_, j) => j !== i))}
                      className="p-2 text-muted-foreground"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {times.length < 12 && (
                <Button variant="outline" size="sm" onClick={() => setTimes([...times, "20:00"])}>
                  <Plus size={13} /> Add time
                </Button>
              )}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold">Days of the week *</legend>
            <div className="flex flex-wrap gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={days.includes(i)}
                  onClick={() =>
                    setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i])
                  }
                  className={`min-w-12 rounded-lg border px-2.5 py-2.5 text-xs font-medium ${days.includes(i) ? "border-primary/20 bg-primary/8 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {day}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Responsible member">
              <Select
                name="responsible_member_id"
                defaultValue={medication?.responsible_member_id || ""}
              >
                <option value="">Profile owner / not yet assigned</option>
                {data.members
                  .filter((m) => m.active && m.role !== "viewer")
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Reminder lead time (minutes)">
              <Input
                type="number"
                name="reminder_minutes"
                min={0}
                max={1440}
                defaultValue={medication?.schedule.reminder_minutes ?? 15}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="reminders_enabled"
              defaultChecked={medication?.schedule.reminders_enabled ?? true}
            />{" "}
            Send email reminders to the responsible member
          </label>
          {medication && (
            <Field
              label="Reason for this change"
              required
              hint="The previous version and every existing dose report remain in history."
            >
              <Textarea name="reason" required placeholder="What changed, and why?" />
            </Field>
          )}
          <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-[11px] leading-5 text-muted-foreground">
            <Info size={14} className="mt-0.5 shrink-0" />
            If instructions are incomplete or conflicting, contact your doctor or pharmacist for
            confirmation.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || days.length === 0}>
              {busy ? "Saving…" : medication ? "Save new version" : "Add medication"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
