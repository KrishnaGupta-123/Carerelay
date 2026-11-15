"use client";
import { useState } from "react";
import { HeartHandshake, Users, ArrowRight, ShieldCheck, Plus } from "lucide-react";
import { useCare } from "./care-provider";
import { Card } from "./ui/common";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Field, Input, Select, Textarea } from "./ui/fields";
export function Onboarding() {
  const { data, act, busy } = useCare();
  const [create, setCreate] = useState(false);
  const [join, setJoin] = useState(false);
  return (
    <div className="mx-auto max-w-3xl py-14 page-enter">
      <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary">
        <HeartHandshake size={16} /> Your first step toward shared care
      </span>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-1.4px]">
        Welcome, {data.user.name.split(" ")[0]}.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
        Make a space for your healthcare routine, or join a care circle with a code from its profile
        owner. Every person has their own account and clearly defined permissions.
      </p>
      <div className="mt-9 grid gap-5 sm:grid-cols-2">
        <Card className="p-7">
          <span className="grid size-12 place-items-center rounded-xl bg-primary/8 text-primary">
            <HeartHandshake size={24} />
          </span>
          <h2 className="mt-5 text-lg font-semibold">Create my care profile</h2>
          <p className="my-3 text-sm leading-6 text-muted-foreground">
            Keep your medication routine, appointments, and trusted people in one place. You control
            access.
          </p>
          <Button onClick={() => setCreate(true)}>
            <Plus size={15} /> Create profile
          </Button>
        </Card>
        <Card className="p-7">
          <span className="grid size-12 place-items-center rounded-xl bg-violet-50 text-violet-600">
            <Users size={24} />
          </span>
          <h2 className="mt-5 text-lg font-semibold">Join a care circle</h2>
          <p className="my-3 text-sm leading-6 text-muted-foreground">
            Enter the secure invitation code shared with you by the profile owner or authorised
            coordinator.
          </p>
          <Button variant="outline" onClick={() => setJoin(true)}>
            Enter invitation code <ArrowRight size={15} />
          </Button>
        </Card>
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck size={14} /> A family relationship alone does not grant access to a care
        profile.
      </p>
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent>
          <DialogTitle>Create your healthcare profile</DialogTitle>
          <DialogDescription>
            This profile belongs to you. You can invite others and decide which responsibilities to
            share.
          </DialogDescription>
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await act("create_profile", {
                  preferred_name: f.get("name"),
                  date_of_birth: f.get("dob") || null,
                  timezone: f.get("timezone"),
                  notes: f.get("notes") || "",
                });
                setCreate(false);
              } catch {}
            }}
          >
            <Field label="Preferred name" required>
              <Input
                name="name"
                required
                defaultValue={data.user.name.split(" ")[0]}
                maxLength={100}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date of birth (optional)">
                <Input type="date" name="dob" />
              </Field>
              <Field label="Your timezone">
                <Select name="timezone" defaultValue="Asia/Kolkata">
                  {[
                    "Asia/Kolkata",
                    "Asia/Dubai",
                    "Europe/London",
                    "America/New_York",
                    "America/Los_Angeles",
                    "Australia/Sydney",
                    "UTC",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Care preferences (optional)">
              <Textarea
                name="notes"
                placeholder="Anything you would like your authorised care circle to know."
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              Create my profile
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <JoinDialog open={join} onOpenChange={setJoin} />
    </div>
  );
}
export function JoinDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { act, busy } = useCare();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Join a care circle</DialogTitle>
        <DialogDescription>
          Use the single-use code from the profile owner. You’ll join with the permissions they
          selected for you.
        </DialogDescription>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await act("join", { code: f.get("code") });
              onOpenChange(false);
            } catch {}
          }}
        >
          <Field
            label="Invitation code"
            required
            hint="Invitations expire after 48 hours and can only be used once."
          >
            <Input
              name="code"
              placeholder="CR-…"
              autoComplete="off"
              required
              className="font-mono uppercase"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            Join care circle <ArrowRight size={15} />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
