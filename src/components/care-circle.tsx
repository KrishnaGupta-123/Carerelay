"use client";
import { useState } from "react";
import {
  UserPlus,
  ShieldCheck,
  Check,
  Copy,
  Link2,
  Clock,
  X,
  Trash2,
  HeartHandshake,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import type { Member, Role } from "@/lib/types";
import { useCare } from "./care-provider";
import { PageHeading, AddButton } from "./page-heading";
import { Card, Avatar, Badge } from "./ui/common";
import { Button } from "./ui/button";
import { Field, Select } from "./ui/fields";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { JoinDialog } from "./onboarding";
import { roleLabels, prettyDate } from "@/lib/utils";
const permissions: Record<Role, string[]> = {
  owner: [
    "Full visibility of their healthcare profile",
    "Medication and appointment management",
    "Invitation and access control",
    "Control of delegated responsibilities",
  ],
  coordinator: [
    "Medication and appointment management",
    "Care assignment and transfer",
    "Care timeline and unresolved tasks",
    "Invitations only when authorised",
  ],
  caretaker: [
    "Information for authorised tasks",
    "Accept or decline handoffs",
    "Record assigned dose reports and help",
    "No medication instruction editing",
  ],
  viewer: [
    "View authorised care information",
    "View medication reports and appointments",
    "View the care timeline",
    "No editing or task management",
  ],
};
export function CareCircle() {
  const { data, now, act, busy } = useCare();
  const [invite, setInvite] = useState(false);
  const [code, setCode] = useState("");
  const [role, setRole] = useState<Role>("caretaker");
  const [remove, setRemove] = useState<Member>();
  const [join, setJoin] = useState(false);
  const owner = data.membership?.role === "owner";
  const canInvite =
    owner || (data.membership?.role === "coordinator" && data.membership.can_invite);
  const pending = data.invitations.filter(
    (i) => !i.consumed_at && !i.revoked_at && new Date(i.expires_at) > now,
  );
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="Good care takes a circle"
        title="Care circle"
        description="The people you trust, the permissions you choose, and the help you share."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-9" onClick={() => setJoin(true)}>
              <Link2 size={13} /> Join another circle
            </Button>
            {canInvite && (
              <AddButton
                onClick={() => {
                  setCode("");
                  setInvite(true);
                }}
              >
                Invite member
              </AddButton>
            )}
          </div>
        }
      />
      <div className="mb-6 flex items-start gap-4 rounded-xl border border-primary/12 bg-primary/4 px-5 py-4">
        <ShieldCheck size={22} className="mt-1 shrink-0 text-primary" />
        <div>
          <h2 className="text-xs font-semibold text-primary">
            {data.profile?.preferred_name} remains at the centre of their care.
          </h2>
          <p className="mt-1 text-[11px] leading-6 text-muted-foreground">
            Only the profile owner can revoke a member’s access. A relationship or payment does not
            automatically grant permissions.
          </p>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {data.members
          .filter((m) => m.active)
          .map((member, i) => {
            const assigned = data.assignments.filter(
              (a) => a.current_owner_id === member.id && a.status !== "completed",
            );
            return (
              <Card key={member.id} className="p-6">
                <div className="flex items-start justify-between">
                  <Avatar name={member.name} tone={i} className="size-12 text-sm" />
                  <Badge tone={member.role === "owner" ? "green" : "neutral"}>
                    {member.user_id === data.user.id ? "You" : "Active member"}
                  </Badge>
                </div>
                <h2 className="mt-4 text-sm font-semibold">{member.name}</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">{roleLabels[member.role]}</p>
                <p className="mt-2 text-[10px] text-muted-foreground">{member.email}</p>
                <div className="mt-5 space-y-2.5 border-t border-border pt-4">
                  {permissions[member.role].map((permission) => (
                    <p
                      key={permission}
                      className="flex items-center gap-2 text-[10px] text-muted-foreground"
                    >
                      <Check size={11} className="shrink-0 text-[#90a78e]" />
                      {permission}
                    </p>
                  ))}
                  {member.role === "coordinator" && member.can_invite && (
                    <Badge tone="green">Invitations authorised by owner</Badge>
                  )}
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-[9px] text-muted-foreground">
                    Joined {prettyDate(member.joined_at, data.profile?.timezone)}
                  </span>
                  <span className="text-[9px] text-primary">
                    {assigned.length} open {assigned.length === 1 ? "task" : "tasks"}
                  </span>
                </div>
                {owner && member.role !== "owner" && (
                  <Button
                    className="mt-4 w-full"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemove(member)}
                  >
                    <Trash2 size={12} /> Revoke access
                  </Button>
                )}
              </Card>
            );
          })}
      </div>
      {canInvite && (
        <Card className="mt-7">
          <div className="flex items-center justify-between border-b border-border px-6 py-5">
            <h2 className="text-sm font-semibold">Pending invitations</h2>
            <Badge>{pending.length} pending</Badge>
          </div>
          {pending.length ? (
            <div className="divide-y divide-border">
              {pending.map((i) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-600">
                      <KeyRound size={17} />
                    </span>
                    <div>
                      <p className="text-xs font-semibold">{roleLabels[i.role]}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Expires {prettyDate(i.expires_at, data.profile?.timezone, "d MMM, h:mm a")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone="amber">
                      <Clock size={11} /> Awaiting member
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          await act("revoke_invitation", { id: i.id });
                        } catch {}
                      }}
                    >
                      <X size={12} /> Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-4 px-6 py-8">
              <UserPlus className="text-muted-foreground" size={21} />
              <p className="text-xs leading-6 text-muted-foreground">
                No pending invitations. Create a secure, expiring code when someone joins your
                circle.
              </p>
            </div>
          )}
        </Card>
      )}
      <Card className="mt-7 flex items-center gap-4 bg-[#f0f5f0] p-5">
        <HeartHandshake size={23} className="shrink-0 text-primary" />
        <p className="text-xs leading-7 text-muted-foreground">
          The circle works best when each person knows their part. Backup caretakers see information
          for their authorised tasks; family viewers have read-only access.
        </p>
      </Card>
      <Dialog open={invite} onOpenChange={setInvite}>
        <DialogContent>
          <DialogTitle>
            {code ? "Your invitation is ready" : "Invite someone to the care circle"}
          </DialogTitle>
          <DialogDescription>
            {code
              ? "Copy this code now and share it with the intended person. It is shown only once, expires in 48 hours, and can be used by one account."
              : "Choose the role and permissions for the person you want to invite. They will sign in to their own account and enter the secure code."}
          </DialogDescription>
          {code ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-primary/20 bg-primary/4 p-5">
                <p className="mb-3 text-xs font-semibold text-primary">
                  {roleLabels[role]} · Single-use invitation
                </p>
                <p className="break-all font-mono text-xl font-semibold tracking-wide">{code}</p>
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(code);
                      toast.success("Invitation code copied");
                    } catch {
                      toast.error("Select the code and copy it manually.");
                    }
                  }}
                >
                  <Copy size={14} /> Copy invitation code
                </Button>
              </div>
              <p className="text-xs leading-6 text-muted-foreground">
                Only a hash is stored in the database. The code is not recoverable from a previous
                session. You can revoke this invitation and create another.
              </p>
              <Button className="w-full" onClick={() => setInvite(false)}>
                Done
              </Button>
            </div>
          ) : (
            <form
              className="space-y-5"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  const r = await act(
                    "invite",
                    { role, can_invite: f.get("can_invite") === "on" },
                    { silent: true },
                  );
                  setCode(String(r.code));
                } catch {}
              }}
            >
              <Field label="Member’s role">
                <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {owner && <option value="coordinator">Family coordinator</option>}
                  <option value="caretaker">Backup caretaker</option>
                  <option value="viewer">Family viewer</option>
                </Select>
              </Field>
              <div className="space-y-2 rounded-lg bg-muted p-4">
                {permissions[role].map((p) => (
                  <p key={p} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check size={12} className="text-primary" />
                    {p}
                  </p>
                ))}
              </div>
              {owner && role === "coordinator" && (
                <label className="flex items-start gap-2 text-xs leading-6">
                  <input name="can_invite" type="checkbox" className="mt-1.5" /> Authorise this
                  coordinator to invite backup caretakers and viewers
                </label>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                Generate secure invitation <KeyRound size={14} />
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!remove}
        onOpenChange={(o) => {
          if (!o) setRemove(undefined);
        }}
      >
        <DialogContent>
          <DialogTitle>Revoke {remove?.name}’s access?</DialogTitle>
          <DialogDescription>
            This member will lose access immediately. Their historical reports remain traceable.
            Open responsibilities assigned to them become unresolved so the circle can reassign
            them.
          </DialogDescription>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setRemove(undefined)}>
              Keep access
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!remove) return;
                try {
                  await act("remove_member", { id: remove.id });
                  setRemove(undefined);
                } catch {}
              }}
            >
              Revoke access
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <JoinDialog open={join} onOpenChange={setJoin} />
    </div>
  );
}
