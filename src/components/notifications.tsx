"use client";
import { useState } from "react";
import {
  Bell,
  Mail,
  CheckCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useCare } from "./care-provider";
import { PageHeading } from "./page-heading";
import { Card, Badge, EmptyState } from "./ui/common";
import { Button } from "./ui/button";
import { prettyDate } from "@/lib/utils";
export function Notifications() {
  const { data, act, busy } = useCare();
  const [tab, setTab] = useState("all");
  const notifications = data.notifications.filter((n) => tab === "all" || !n.read_at);
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="The right update, at the right time"
        title="Notifications"
        description="Your care updates and the recorded status of email delivery."
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={busy || data.notifications.every((n) => n.read_at)}
            onClick={async () => {
              try {
                await act("notification_read", { all: true });
              } catch {}
            }}
          >
            <CheckCheck size={14} /> Mark all read
          </Button>
        }
      />
      {!data.emailConfigured && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/50 p-5">
          <Mail size={20} className="shrink-0 text-amber-600" />
          <div>
            <p className="text-xs font-semibold text-amber-800">
              Email delivery needs configuration
            </p>
            <p className="mt-1 text-[11px] leading-6 text-amber-700">
              Care updates are recorded here. No email is sent until RESEND_API_KEY and the sending
              address are configured.
            </p>
            <Link
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800"
              href="/settings"
            >
              Notification settings <ExternalLink size={11} />
            </Link>
          </div>
        </div>
      )}
      <div className="mb-5 flex gap-7 border-b border-border">
        {[
          ["all", "All updates"],
          ["unread", "Unread"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative pb-3 text-xs ${tab === id ? "font-semibold text-primary" : "text-muted-foreground"}`}
          >
            {label}
            {tab === id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
          </button>
        ))}
      </div>
      <Card>
        {notifications.length ? (
          <div className="divide-y divide-border">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-4 px-6 py-5 ${!n.read_at ? "bg-primary/2" : ""}`}
              >
                <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl bg-primary/7 text-primary">
                  <Bell size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xs font-semibold">
                      {n.subject}
                      {!n.read_at && (
                        <span className="ml-2 inline-block size-1.5 rounded-full bg-primary" />
                      )}
                    </h2>
                    <Badge
                      tone={
                        n.status === "sent"
                          ? "green"
                          : n.status === "failed"
                            ? "red"
                            : n.status === "unconfigured"
                              ? "amber"
                              : "neutral"
                      }
                    >
                      {n.status === "sent" ? (
                        <CheckCircle2 size={11} />
                      ) : n.status === "failed" ? (
                        <AlertCircle size={11} />
                      ) : (
                        <Clock size={11} />
                      )}
                      Email {n.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[11px] leading-7 text-muted-foreground">{n.body}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] text-muted-foreground">
                      {prettyDate(n.created_at, data.profile?.timezone, "d MMM yyyy, h:mm a")}
                      {n.sent_at
                        ? ` · Delivered ${prettyDate(n.sent_at, data.profile?.timezone, "h:mm a")}`
                        : ""}
                    </p>
                    {!n.read_at && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px]"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            await act("notification_read", { id: n.id }, { silent: true });
                          } catch {}
                        }}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                  {n.error && (
                    <p className="mt-2 text-[10px] leading-6 text-amber-700">
                      Delivery detail: {n.error}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Bell}
            title={tab === "unread" ? "You’re all caught up" : "Care updates will appear here"}
            description="Reminders, handoff responses, and important care changes are recorded with their delivery outcomes."
          />
        )}
      </Card>
    </div>
  );
}
