"use client";
import { useState } from "react";
import {
  ArrowRight,
  ArrowLeftRight,
  Check,
  X,
  MessageCircle,
  History,
  ChevronRight,
} from "lucide-react";
import type { Assignment } from "@/lib/types";
import { useCare } from "./care-provider";
import { Card, Avatar, Badge } from "./ui/common";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Textarea, Field } from "./ui/fields";
import { HandoffForm } from "./handoff-form";
import { ActivityList } from "./activity-list";
import { canManage, localTime, prettyDate, shortName } from "@/lib/utils";
export function HandoffCard({
  assignment,
  compact = false,
}: {
  assignment: Assignment;
  compact?: boolean;
}) {
  const { data, act, busy } = useCare();
  const [transfer, setTransfer] = useState(false);
  const [history, setHistory] = useState(false);
  const [help, setHelp] = useState(false);
  const [response, setResponse] = useState<"accept" | "decline" | "complete" | null>(null);
  const current = data.members.find((m) => m.id === assignment.current_owner_id);
  const proposed = data.members.find((m) => m.id === assignment.proposed_owner_id);
  const previous = data.members.find((m) => m.id === assignment.previous_owner_id);
  const recipient =
    assignment.status === "pending" && assignment.proposed_owner_id === data.membership?.id;
  const manage =
    canManage(data.membership?.role) ||
    (data.membership?.role === "caretaker" && assignment.current_owner_id === data.membership.id);
  const dose = data.doses.find((d) => d.id === assignment.dose_event_id);
  const completeAllowed =
    assignment.status !== "pending" &&
    assignment.status !== "completed" &&
    (!dose ||
      ["self_reported_taken", "assisted_recorded", "declined", "explicitly_missed"].includes(
        dose.status,
      ));
  return (
    <>
      <Card className={compact ? "border-[#ecdfbd] bg-[#fffcf5] p-5" : "p-6"}>
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-8 place-items-center rounded-lg bg-[#f5efde] text-[#aa9262]">
            <ArrowLeftRight size={15} />
          </span>
          <Badge
            tone={
              assignment.status === "pending"
                ? "amber"
                : assignment.status === "accepted" || assignment.status === "completed"
                  ? "green"
                  : assignment.status === "declined"
                    ? "red"
                    : "neutral"
            }
          >
            {assignment.status === "pending"
              ? "Awaiting acceptance"
              : assignment.status.charAt(0).toUpperCase() + assignment.status.slice(1)}
          </Badge>
        </div>
        <h3 className="mt-4 text-sm font-semibold">{assignment.title}</h3>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {prettyDate(assignment.due_at, data.profile?.timezone)} ·{" "}
          {localTime(assignment.due_at, data.profile?.timezone)}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <div className="flex items-center gap-2">
            {current ? (
              <Avatar name={current.name} tone={1} className="size-7" />
            ) : (
              <span className="grid size-7 place-items-center rounded-full bg-muted text-[10px] text-muted-foreground">
                ?
              </span>
            )}
            <div>
              <p className="text-[10px] font-semibold">
                {current ? shortName(current.name) : "Unassigned"}
              </p>
              <p className="mt-0.5 text-[8px] text-muted-foreground">Current responsibility</p>
            </div>
          </div>
          {proposed && (
            <>
              <ArrowRight size={15} className="mx-1 text-[#b9bea9]" />
              <div className="flex items-center gap-2">
                <Avatar name={proposed.name} tone={2} className="size-7" />
                <div>
                  <p className="text-[10px] font-semibold">{shortName(proposed.name)}</p>
                  <p className="mt-0.5 text-[8px] text-muted-foreground">Invited to help</p>
                </div>
              </div>
            </>
          )}
        </div>
        {previous && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            Previously responsible: {previous.name}
          </p>
        )}
        {assignment.note && (
          <p className="mt-4 border-t border-border/70 pt-3 text-[11px] leading-6 text-muted-foreground">
            “{assignment.note}”
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {recipient ? (
            <>
              <Button size="sm" onClick={() => setResponse("accept")} disabled={busy}>
                <Check size={12} /> Accept handoff
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResponse("decline")}
                disabled={busy}
              >
                <X size={12} /> Decline
              </Button>
            </>
          ) : manage && assignment.status !== "completed" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setTransfer(true)}>
                <ArrowLeftRight size={12} />
                {assignment.status === "pending" ? "Reassign" : "Transfer"}
              </Button>
              {completeAllowed && (
                <Button size="sm" variant="secondary" onClick={() => setResponse("complete")}>
                  <Check size={12} /> Complete
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHelp(true)}
                aria-label="Request help with this task"
              >
                <MessageCircle size={13} />
              </Button>
            </>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHistory(true)}
            className="ml-auto px-1 text-[10px]"
          >
            {compact ? "History" : "View history"}
            <ChevronRight size={12} />
          </Button>
        </div>
        {dose &&
          assignment.status !== "completed" &&
          !completeAllowed &&
          assignment.status !== "pending" && (
            <p className="mt-3 text-[10px] text-muted-foreground">
              Record the dose report in Medications to resolve this responsibility.
            </p>
          )}
      </Card>
      <HandoffForm
        key={`${assignment.id}-${assignment.version}`}
        open={transfer}
        onOpenChange={setTransfer}
        assignment={assignment}
      />
      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent>
          <DialogTitle className="flex items-center gap-2">
            <History size={18} /> Handoff history
          </DialogTitle>
          <DialogDescription>
            Each responsibility change is recorded with its actor and time.
          </DialogDescription>
          <ActivityList
            compact={false}
            events={data.audit.filter(
              (a) => a.entity_type === "assignment" && a.entity_id === assignment.id,
            )}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!response}
        onOpenChange={(o) => {
          if (!o) setResponse(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {response === "accept"
              ? "Accept this responsibility?"
              : response === "decline"
                ? "Decline this handoff?"
                : "Complete this care task?"}
          </DialogTitle>
          <DialogDescription>
            {response === "accept"
              ? "You will become the current responsible person. The previous and new responsibility will be recorded."
              : response === "decline"
                ? "The current person will stay responsible. The coordinator will be notified so they can arrange support."
                : "Completing this task records the assistance provided. It does not verify medication ingestion."}
          </DialogDescription>
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const note = String(new FormData(e.currentTarget).get("note") || "");
              try {
                await act(response === "complete" ? "complete_task" : "handoff_response", {
                  id: assignment.id,
                  expected_version: assignment.version,
                  note,
                  ...(response !== "complete" ? { accept: response === "accept" } : {}),
                });
                setResponse(null);
              } catch {}
            }}
          >
            <Field label="Note (optional)">
              <Textarea name="note" placeholder="Anything the care circle should know?" />
            </Field>
            <Button className="w-full" type="submit" disabled={busy}>
              {response === "accept"
                ? "Accept responsibility"
                : response === "decline"
                  ? "Decline handoff"
                  : "Complete task"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>Request help with this task</DialogTitle>
          <DialogDescription>
            {assignment.title}. Your note will be visible in the care timeline and the coordinator
            will be notified.
          </DialogDescription>
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await act("task_help", {
                  id: assignment.id,
                  expected_version: assignment.version,
                  note: new FormData(e.currentTarget).get("note"),
                });
                setHelp(false);
              } catch {}
            }}
          >
            <Field label="Describe the issue" required>
              <Textarea name="note" required />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>
              Ask for help
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
