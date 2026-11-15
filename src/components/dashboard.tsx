"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Pill,
  CalendarDays,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Sun,
  HeartHandshake,
  Users,
  HelpCircle,
  Info,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { useCare } from "./care-provider";
import { Card, Avatar, Badge, StatusBadge, EmptyState } from "./ui/common";
import { Button } from "./ui/button";
import { Input } from "./ui/fields";
import { MedicationForm } from "./medication-form";
import { AppointmentForm } from "./appointment-form";
import { DoseActions } from "./dose-actions";
import { HandoffCard } from "./handoff-card";
import { ActivityList } from "./activity-list";
import { HelpDialog } from "./help-dialog";
import { localDate, localTime, prettyDate, canManage, shortName } from "@/lib/utils";
export function Dashboard() {
  const { data, now } = useCare();
  const [add, setAdd] = useState(false);
  const [appointment, setAppointment] = useState(false);
  const [help, setHelp] = useState(false);
  const [filter, setFilter] = useState("all");
  const profile = data.profile!;
  const tz = profile.timezone;
  const role = data.membership?.role;
  const manager = canManage(role);
  const today = localDate(now, tz);
  const [date, setDate] = useState(today);
  const todayDoses = data.doses.filter((d) => localDate(d.scheduled_at, tz) === today);
  const records = todayDoses.filter(
    (d) => !["scheduled", "unconfirmed", "needs_help"].includes(d.status),
  );
  const needsAttention = todayDoses.filter((d) =>
    ["unconfirmed", "needs_help", "explicitly_missed"].includes(d.status),
  );
  const pending = data.assignments.filter((a) => a.status === "pending");
  const unresolved = data.assignments.filter((a) => a.status !== "completed");
  const appointments = data.appointments.filter(
    (a) => a.status === "upcoming" && new Date(a.starts_at) > now,
  );
  const nextAppointment = appointments[0];
  const nextDose = data.doses.find(
    (d) => new Date(d.scheduled_at) > now && d.status === "scheduled",
  );
  const schedule = data.doses
    .filter((d) => localDate(d.scheduled_at, tz) === date)
    .filter(
      (d) =>
        filter === "all" ||
        (filter === "upcoming" && ["scheduled", "unconfirmed", "needs_help"].includes(d.status)) ||
        (filter === "recorded" && !["scheduled", "unconfirmed", "needs_help"].includes(d.status)),
    );
  const stats = [
    {
      label: "Today’s medication",
      value: `${records.length}`,
      suffix: ` / ${todayDoses.length}`,
      meta: "dose statuses recorded",
      icon: Pill,
      color: "#8d9bba",
      bg: "#f1f3fa",
      progress: todayDoses.length ? records.length / todayDoses.length : 0,
    },
    {
      label: "Needs a little attention",
      value: String(needsAttention.length),
      suffix: "",
      meta: needsAttention.length ? "statuses to follow up" : "Everything looks clear",
      icon: Clock,
      color: "#c0a57a",
      bg: "#faf5e9",
      progress: null,
    },
    {
      label: "Care handoffs",
      value: String(pending.length),
      suffix: "",
      meta: pending.length ? "awaiting acceptance" : "No pending transfers",
      icon: ArrowLeftRight,
      color: "#8aaa91",
      bg: "#f0f5ee",
      progress: null,
    },
    {
      label: "Upcoming appointments",
      value: String(appointments.length),
      suffix: "",
      meta: nextAppointment
        ? `${prettyDate(nextAppointment.starts_at, tz)} · ${localTime(nextAppointment.starts_at, tz)}`
        : "Nothing scheduled yet",
      icon: CalendarDays,
      color: "#b597aa",
      bg: "#f7f0f4",
      progress: null,
    },
  ];
  return (
    <div className="page-enter">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Sun size={13} className="text-[#c7ae82]" />
            {prettyDate(now, tz, "EEEE, d MMMM yyyy")}
          </div>
          <h1 className="text-[28px] font-semibold tracking-[-1px]">
            Good{" "}
            {Number(
              new Intl.DateTimeFormat("en", {
                hour: "numeric",
                hour12: false,
                timeZone: tz,
              }).format(now),
            ) < 12
              ? "morning"
              : Number(
                    new Intl.DateTimeFormat("en", {
                      hour: "numeric",
                      hour12: false,
                      timeZone: tz,
                    }).format(now),
                  ) < 17
                ? "afternoon"
                : "evening"}
            , {shortName(data.user.name)}{" "}
            <span className="inline-block text-2xl" aria-hidden="true">
              ☀︎
            </span>
          </h1>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            {role === "caretaker"
              ? `Here’s where you can help ${profile.preferred_name} today.`
              : `Let’s make ${role === "owner" ? "your" : `${profile.preferred_name}’s`} day a little easier, together.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {role !== "viewer" && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3.5"
              onClick={() => setHelp(true)}
            >
              <HelpCircle size={13} /> Request help
            </Button>
          )}
          {manager && (
            <Button size="sm" className="h-9 px-3.5" onClick={() => setAdd(true)}>
              <Plus size={13} /> Add medication
            </Button>
          )}
        </div>
      </div>
      <div className="mb-6 flex flex-col justify-between gap-5 overflow-hidden rounded-xl border border-[#dae7db] bg-[#edf3ed] px-6 py-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="relative grid size-[54px] place-items-center rounded-2xl border border-[#d4e2d4] bg-white/55">
            <HeartHandshake size={26} strokeWidth={1.35} className="text-[#729b78]" />
            <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-[#edf3ed] bg-primary">
              <CheckCircle2 size={11} className="text-white" />
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#446b4d]">A shared circle. A calmer day.</p>
            <p className="mt-1.5 text-[11px] leading-5 text-[#8a9b87]">
              {unresolved.length
                ? `${unresolved.length} care ${unresolved.length === 1 ? "task needs" : "tasks need"} a clear next step. Your circle can help.`
                : "You’re connected with the people who care. Every small update keeps everyone in sync."}
            </p>
          </div>
        </div>
        <Link
          href="/handoffs"
          className="inline-flex shrink-0 items-center gap-3 text-[11px] font-semibold text-[#6a886b]"
        >
          View care handoffs <ArrowRight size={14} />
        </Link>
      </div>
      <div className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={
                i === 0
                  ? "/medications"
                  : i === 1
                    ? "/activity"
                    : i === 2
                      ? "/handoffs"
                      : "/appointments"
              }
            >
              <Card className="h-full px-5 pb-4 pt-4 transition hover:border-primary/20">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-[#8b978f]">{s.label}</p>
                  <span
                    className="grid size-7 place-items-center rounded-lg"
                    style={{ background: s.bg, color: s.color }}
                  >
                    <Icon size={14} />
                  </span>
                </div>
                <p className="mt-3 text-[28px] font-semibold leading-9 tracking-[-1px]">
                  {s.value}
                  <span className="text-lg font-normal text-[#b2bab5]">{s.suffix}</span>
                </p>
                <div className="mt-2 flex items-center justify-between gap-1">
                  <p className="text-[9px] text-muted-foreground">{s.meta}</p>
                  {s.progress !== null ? (
                    <div
                      className="flex gap-0.5"
                      aria-label={`${Math.round(s.progress * 100)}% of dose statuses recorded`}
                    >
                      {Array.from({ length: 8 }, (_, j) => (
                        <span
                          key={j}
                          className={`h-3.5 w-1 rounded-xs ${j < Math.round(s.progress! * 8) ? "bg-[#83ad8c]" : "bg-[#edf1ed]"}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <ArrowUpRight size={12} className="text-[#b5bdb7]" />
                  )}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_290px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">Today’s medication schedule</h2>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Recorded instructions. Clear responsibilities.
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <CalendarDays size={12} />
                <Input
                  aria-label="Schedule date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-7 w-[125px] border-none bg-muted py-1 text-[10px]"
                />
              </div>
            </div>
            <div className="flex gap-5 border-b border-border px-5">
              {[
                ["all", "All doses"],
                ["upcoming", "To update"],
                ["recorded", "Recorded"],
              ].map(([f, l]) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`relative py-3.5 text-[10px] font-medium ${filter === f ? "text-primary" : "text-muted-foreground"}`}
                >
                  {l}
                  {filter === f && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t bg-primary" />
                  )}
                </button>
              ))}
            </div>
            {schedule.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left">
                  <thead>
                    <tr className="bg-[#fafcfb] text-[8px] font-medium tracking-[.5px] text-[#a3ada6]">
                      <th className="px-5 py-3 font-medium">MEDICATION</th>
                      <th className="py-3 font-medium">TIME</th>
                      <th className="py-3 font-medium">STATUS</th>
                      <th className="py-3 font-medium">RESPONSIBLE</th>
                      <th className="py-3 pr-4 text-right font-medium">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((d, i) => {
                      const member = data.members.find((m) => m.id === d.assigned_member_id);
                      return (
                        <tr key={d.id} className="border-t border-border/80">
                          <td className="py-4 pl-5">
                            <div className="flex items-center gap-3">
                              <span
                                className={`grid size-8 place-items-center rounded-lg ${["bg-[#f0edf7] text-[#9a87b4]", "bg-[#edf2f7] text-[#8195af]", "bg-[#f8f2e7] text-[#b89e72]", "bg-[#eef4ee] text-[#8ca58a]"][i % 4]}`}
                              >
                                <Pill size={15} strokeWidth={1.65} />
                              </span>
                              <div>
                                <p className="text-[11px] font-semibold">
                                  {d.snapshot.name}
                                  <span className="ml-1.5 text-[9px] font-normal text-muted-foreground">
                                    {d.snapshot.strength}
                                  </span>
                                </p>
                                <p className="mt-1 text-[9px] text-muted-foreground">
                                  {d.snapshot.dosage}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="text-[10px] text-[#859187]">
                            {localTime(d.scheduled_at, tz)}
                          </td>
                          <td>
                            <StatusBadge status={d.status} />
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              {member && (
                                <Avatar
                                  name={member.name}
                                  tone={member.role === "coordinator" ? 1 : 2}
                                  className="size-5 text-[7px]"
                                />
                              )}
                              <span className="text-[9px] text-muted-foreground">
                                {member ? shortName(member.name) : "Unassigned"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pl-2 pr-4">
                            <div className="flex justify-end">
                              <DoseActions dose={d} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Pill}
                title={filter === "all" ? "A clear schedule starts here" : "No doses in this view"}
                description={
                  data.medications.length
                    ? "Choose another day or filter to see scheduled and recorded doses."
                    : "Add the instructions from a prescription to create a shared medication routine."
                }
                action={
                  manager && !data.medications.length ? (
                    <Button size="sm" onClick={() => setAdd(true)}>
                      Add medication
                    </Button>
                  ) : undefined
                }
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
              <span className="flex items-center gap-1.5 text-[9px] text-[#a0aaa1]">
                <Info size={11} /> Unconfirmed means the status needs an update.
              </span>
              <Link
                href="/medications"
                className="flex items-center gap-1 text-[10px] font-semibold text-primary"
              >
                All medications <ChevronRight size={12} />
              </Link>
            </div>
          </Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold">Next appointment</h2>
                <Link
                  href="/appointments"
                  aria-label="View appointments"
                  className="text-muted-foreground"
                >
                  <ArrowUpRight size={14} />
                </Link>
              </div>
              {nextAppointment ? (
                <>
                  <div className="flex gap-3">
                    <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-[#e5e9f0] bg-[#f5f7fb] py-2">
                      <span className="text-[8px] uppercase text-[#9ba6b7]">
                        {prettyDate(nextAppointment.starts_at, tz, "MMM")}
                      </span>
                      <span className="text-xl font-semibold text-[#8292ab]">
                        {prettyDate(nextAppointment.starts_at, tz, "dd")}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold">{nextAppointment.doctor_name}</h3>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {nextAppointment.specialty || "Doctor appointment"}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {nextAppointment.clinic}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
                    <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                      <Clock size={11} />
                      {localTime(nextAppointment.starts_at, tz)}
                    </span>
                    <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                      <Users size={11} />
                      {shortName(
                        data.members.find((m) => m.id === nextAppointment.accompanying_member_id)
                          ?.name || "Unassigned",
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <div className="py-4">
                  <p className="text-xs leading-6 text-muted-foreground">
                    No upcoming appointment. Add one to keep the circle informed.
                  </p>
                  {manager && (
                    <Button
                      className="mt-3"
                      variant="outline"
                      size="sm"
                      onClick={() => setAppointment(true)}
                    >
                      Add appointment
                    </Button>
                  )}
                </div>
              )}
            </Card>
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold">Next on the care routine</h2>
                <span className="grid size-6 place-items-center rounded-md bg-primary/7 text-primary">
                  <Pill size={13} />
                </span>
              </div>
              {nextDose ? (
                <>
                  <div className="flex items-center gap-2">
                    <Badge tone="green">
                      <span className="size-1 rounded-full bg-primary" />
                      {localTime(nextDose.scheduled_at, tz)}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {localDate(nextDose.scheduled_at, tz) === today
                        ? "Today"
                        : prettyDate(nextDose.scheduled_at, tz)}
                    </span>
                  </div>
                  <h3 className="mt-3 text-xs font-semibold">
                    {nextDose.snapshot.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      {nextDose.snapshot.strength}
                    </span>
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-[10px] leading-5 text-muted-foreground">
                    {nextDose.snapshot.instructions}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-[9px] text-muted-foreground">
                    <span>{nextDose.snapshot.dosage}</span>
                    <span>Recorded version {nextDose.snapshot.version}</span>
                  </div>
                </>
              ) : (
                <p className="py-4 text-xs leading-6 text-muted-foreground">
                  Your next scheduled medication will appear here.
                </p>
              )}
            </Card>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3">
            <ShieldCheck size={15} className="shrink-0 text-[#9aaa9b]" />
            <p className="text-[9px] leading-5 text-[#a0aaa0]">
              Dose statuses are self-reports or assistance records. CareRelay does not independently
              verify ingestion or replace professional advice.
            </p>
          </div>
        </div>
        <div className="space-y-5">
          {pending[0] && <HandoffCard assignment={pending[0]} compact />}
          <Card className="p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xs font-semibold">Your care circle</h2>
              <Link
                href="/care-circle"
                className="text-muted-foreground"
                aria-label="Manage care circle"
              >
                <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="flex -space-x-2">
              {data.members
                .filter((m) => m.active)
                .map((m, i) => (
                  <Avatar
                    name={m.name}
                    key={m.id}
                    tone={i}
                    className="size-9 border-2 border-white"
                  />
                ))}
              <Link
                href="/care-circle"
                aria-label="Invite or review members"
                className="grid size-9 place-items-center rounded-full border-2 border-white bg-muted text-muted-foreground"
              >
                <Plus size={14} />
              </Link>
            </div>
            <p className="mt-4 text-[11px] font-semibold">
              {data.members.filter((m) => m.active).length} people, one shared purpose.
            </p>
            <p className="mt-1.5 text-[10px] leading-5 text-muted-foreground">
              A little support goes a long way.
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="flex items-center gap-1 text-[9px] text-[#91a38e]">
                <span className="size-1 rounded-full bg-[#8fa987]" />
                Access controlled by {profile.preferred_name}
              </span>
              <Link href="/care-circle" className="text-primary">
                <ChevronRight size={12} />
              </Link>
            </div>
          </Card>
          <Card className="p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xs font-semibold">Recent care activity</h2>
              <span className="text-[8px] text-muted-foreground">YOUR CIRCLE</span>
            </div>
            <ActivityList events={data.audit.slice(0, 5)} />
            <Link
              href="/activity"
              className="mt-5 flex items-center justify-center gap-1 border-t border-border pt-3 text-[10px] font-semibold text-primary"
            >
              View care timeline <ArrowRight size={12} />
            </Link>
          </Card>
        </div>
      </div>
      <MedicationForm key={`medication-${add}`} open={add} onOpenChange={setAdd} />
      <AppointmentForm
        key={`appointment-${appointment}`}
        open={appointment}
        onOpenChange={setAppointment}
      />
      <HelpDialog open={help} onOpenChange={setHelp} />
    </div>
  );
}
