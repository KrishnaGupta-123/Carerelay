"use client";
import {
  Pill,
  Check,
  ArrowLeftRight,
  CalendarDays,
  Users,
  MessageCircle,
  Flag,
  Activity,
} from "lucide-react";
import type { Audit } from "@/lib/types";
import { useCare } from "./care-provider";
import { shortName } from "@/lib/utils";
import { formatDistance } from "date-fns";
export function auditIcon(event: Audit) {
  if (event.action.includes("Self-reported") || event.action.includes("assistance")) return Check;
  if (event.entity_type === "medication") return event.action.includes("Flagged") ? Flag : Pill;
  if (event.entity_type === "assignment") return ArrowLeftRight;
  if (event.entity_type === "appointment") return CalendarDays;
  if (event.entity_type === "member" || event.entity_type === "invitation") return Users;
  if (event.action.includes("help")) return MessageCircle;
  return Activity;
}
export function ActivityList({ events, compact = true }: { events: Audit[]; compact?: boolean }) {
  const { data, now } = useCare();
  if (!events.length)
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Your care activity will appear here.
      </p>
    );
  return (
    <div className={compact ? "space-y-5" : "space-y-0"}>
      {events.map((event, i) => {
        const Icon = auditIcon(event);
        const detail = event.details;
        const name = String(
          detail.name || detail.medication || detail.title || detail.doctor || "",
        );
        const green =
          event.action.includes("Accepted") ||
          event.action.includes("taken") ||
          event.action.includes("Completed");
        return (
          <div
            key={event.id}
            className={`relative flex gap-3 ${compact ? "" : "border-b border-border px-6 py-5 last:border-0"}`}
          >
            {compact && i < events.length - 1 && (
              <span className="absolute left-[13px] top-7 h-[calc(100%+12px)] w-px bg-border" />
            )}
            <span
              className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full ${green ? "bg-[#eaf5ee] text-[#6da287]" : event.entity_type === "medication" ? "bg-[#f0edf7] text-[#9a89b3]" : event.entity_type === "appointment" ? "bg-[#edf1f7] text-[#8197af]" : "bg-[#f7f0e5] text-[#b59e78]"}`}
            >
              <Icon size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-5">
                <span className="font-semibold">{shortName(event.actor_name)}</span>{" "}
                <span className="text-[#76857d]">
                  {event.action.charAt(0).toLowerCase() + event.action.slice(1)}
                  {name ? ` · ${name}` : ""}
                </span>
              </p>
              {!compact && (
                <>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: data.profile?.timezone,
                    }).format(new Date(event.created_at))}{" "}
                    · {event.actor_name}
                  </p>
                  {Boolean(detail.previous_status) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {String(detail.previous_status).replaceAll("_", " ")} →{" "}
                      {String(detail.new_status).replaceAll("_", " ")}
                    </p>
                  )}
                  {Boolean(detail.reason) && (
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">
                      Reason: {String(detail.reason)}
                    </p>
                  )}
                  {Boolean(detail.source) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Source: {String(detail.source)}
                    </p>
                  )}
                  {Boolean(detail.note) && (
                    <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs leading-6 text-muted-foreground">
                      {String(detail.note)}
                    </p>
                  )}
                  {Boolean(
                    detail.current_owner || detail.proposed_owner || detail.previous_owner,
                  ) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {Boolean(detail.previous_owner) && (
                        <>
                          Previous:{" "}
                          {data.members.find((m) => m.id === detail.previous_owner)?.name ||
                            "Unassigned"}{" "}
                          ·{" "}
                        </>
                      )}
                      {Boolean(detail.current_owner) && (
                        <>
                          Responsible:{" "}
                          {data.members.find((m) => m.id === detail.current_owner)?.name ||
                            "Unassigned"}{" "}
                        </>
                      )}
                      {Boolean(detail.proposed_owner) && (
                        <>
                          Proposed:{" "}
                          {data.members.find((m) => m.id === detail.proposed_owner)?.name ||
                            "Unassigned"}
                        </>
                      )}
                    </p>
                  )}
                </>
              )}
              <p className="mt-1 text-[9px] text-[#a0aaa4]">
                {formatDistance(new Date(event.created_at), now, { addSuffix: true })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
