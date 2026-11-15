"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Pill,
  ArrowLeftRight,
  CalendarDays,
  Users,
  Activity,
  Settings,
  ChevronDown,
  Bell,
  Search,
  Menu,
  X,
  LogOut,
  HeartHandshake,
  ShieldCheck,
  Plus,
  ArrowUpRight,
  Sun,
} from "lucide-react";
import { Brand } from "./brand";
import { useCare } from "./care-provider";
import { Avatar, Badge } from "./ui/common";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/fields";
import { cn, roleLabels } from "@/lib/utils";
import { Onboarding, JoinDialog } from "./onboarding";
const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/medications", label: "Medications", icon: Pill },
  { href: "/handoffs", label: "Care handoffs", icon: ArrowLeftRight },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/care-circle", label: "Care circle", icon: Users },
  { href: "/activity", label: "Care timeline", icon: Activity },
];
const pageNames: Record<string, string> = {
  "/dashboard": "Overview",
  "/medications": "Medications",
  "/handoffs": "Care handoffs",
  "/appointments": "Appointments",
  "/care-circle": "Care circle",
  "/activity": "Care timeline",
  "/settings": "Settings",
  "/notifications": "Notifications",
  "/elderly": "My day",
};
export function AppShell({ children }: { children: React.ReactNode }) {
  const { data, switchProfile } = useCare();
  const path = usePathname();
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [join, setJoin] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const unread = data.notifications.filter((n) => !n.read_at).length;
  const pending = data.assignments.filter((a) => a.status === "pending").length;
  const owner = data.members.find((m) => m.role === "owner");
  const profile = data.profile;
  const simple = path === "/elderly";
  const logout = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/login");
    router.refresh();
  };
  const nav = (
    <>
      <div className="px-6 pb-9 pt-8">
        <Brand small />
      </div>
      <div className="relative mx-4 mb-8">
        <button
          onClick={() => setProfileMenu(!profileMenu)}
          aria-expanded={profileMenu}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-[#f8faf8] px-3 py-3 text-left"
        >
          <Avatar
            name={owner?.name || profile?.preferred_name || data.user.name}
            className="size-10"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-semibold">
              {profile ? `${profile.preferred_name}’s care space` : "Your care space"}
            </span>
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {profile ? "A little care, every day" : "Create or join a circle"}
            </span>
          </span>
          <ChevronDown size={13} className="text-muted-foreground" />
        </button>
        {profileMenu && (
          <div className="absolute left-0 right-0 top-full z-40 mt-2 rounded-xl border border-border bg-white p-2 shadow-xl">
            {data.profiles.map((p) => (
              <button
                key={p.id}
                onClick={async () => {
                  await switchProfile(p.id);
                  setProfileMenu(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs hover:bg-muted"
              >
                {p.preferred_name}’s care space
                {p.id === profile?.id && <span className="size-1.5 rounded-full bg-primary" />}
              </button>
            ))}
            <button
              onClick={() => {
                setJoin(true);
                setProfileMenu(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-primary hover:bg-muted"
            >
              <Plus size={13} /> Join another circle
            </button>
          </div>
        )}
      </div>
      <p className="mb-3 px-7 text-[9px] font-semibold tracking-[1.6px] text-[#a1ada7]">
        YOUR WORKSPACE
      </p>
      <nav aria-label="Main navigation" className="space-y-1 px-4">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMobile(false)}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3.5 py-3 text-[12px] font-medium transition",
              path === href
                ? "bg-[#eaf2ed] text-primary"
                : "text-[#7e8b84] hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon size={17} strokeWidth={1.65} />
            {label}
            {href === "/handoffs" && pending > 0 && (
              <span className="ml-auto grid size-5 place-items-center rounded-md bg-[#f0e4c7] text-[10px] font-semibold text-[#9a783b]">
                {pending}
              </span>
            )}
            {path === href && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
            )}
          </Link>
        ))}
      </nav>
      <div className="mt-6 border-t border-border px-4 pt-5">
        <Link
          href="/settings"
          onClick={() => setMobile(false)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3.5 py-3 text-xs",
            path === "/settings" ? "bg-muted text-primary" : "text-[#7e8b84]",
          )}
        >
          <Settings size={17} strokeWidth={1.65} /> Settings & preferences
        </Link>
        {data.membership?.role === "owner" && (
          <Link
            href="/elderly"
            onClick={() => setMobile(false)}
            className="mt-1 flex items-center gap-3 rounded-lg px-3.5 py-3 text-xs text-primary"
          >
            <Sun size={17} /> Switch to simple view
            <ArrowUpRight size={13} className="ml-auto" />
          </Link>
        )}
      </div>
      <div className="mt-auto p-5">
        <div className="relative overflow-hidden rounded-xl border border-[#e3ece4] bg-[#f0f5f0] p-4">
          <HeartHandshake size={20} className="mb-3 text-primary" />
          <p className="text-xs font-semibold">Small moments. Shared care.</p>
          <p className="mt-2 text-[10px] leading-[1.8] text-[#8c9a8b]">
            When everyone knows their part,
            <br />
            care feels a little lighter.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-border px-5 py-5">
        <Avatar name={data.user.name} tone={1} className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold">{data.user.name}</p>
          <p className="mt-0.5 text-[9px] text-muted-foreground">
            {data.membership ? roleLabels[data.membership.role] : "CareRelay member"}
          </p>
        </div>
        <button
          onClick={logout}
          aria-label="Sign out"
          title="Sign out"
          className="p-1 text-muted-foreground hover:text-primary"
        >
          <LogOut size={15} />
        </button>
      </div>
    </>
  );
  if (simple)
    return (
      <div className="min-h-dvh">
        <header className="flex items-center justify-between border-b border-border bg-white px-5 py-5 md:px-12">
          <Brand />
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-xs font-semibold text-primary">
              Detailed view
            </Link>
            <button aria-label="Sign out" onClick={logout}>
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main id="main-content">{profile ? children : <Onboarding />}</main>
      </div>
    );
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[228px] flex-col border-r border-border bg-white lg:flex">
        {nav}
      </aside>
      {mobile && (
        <>
          <div
            onClick={() => setMobile(false)}
            className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col overflow-y-auto bg-white lg:hidden">
            <button
              aria-label="Close navigation"
              onClick={() => setMobile(false)}
              className="absolute right-4 top-8"
            >
              <X size={18} />
            </button>
            {nav}
          </aside>
        </>
      )}
      <div className="lg:ml-[228px]">
        <header className="sticky top-0 z-30 flex h-[75px] items-center justify-between border-b border-border bg-white/95 px-5 backdrop-blur-sm md:px-9">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
              className="text-muted-foreground lg:hidden"
            >
              <Menu size={21} />
            </button>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Your workspace
            </span>
            <span className="hidden text-[11px] text-[#c5cec8] sm:inline">/</span>
            <span className="text-[11px] font-medium">{pageNames[path] || "CareRelay"}</span>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden items-center gap-1.5 rounded-full bg-[#f1f7f1] px-2.5 py-1 text-[9px] font-medium text-[#81a081] md:inline-flex">
              <span className="size-1 rounded-full bg-[#85aa82]" />
              {data.mode === "local" ? "Fictional demo" : "Secure care space"}
            </span>
            <button
              aria-label="Search your care space"
              onClick={() => setSearch(true)}
              className="text-muted-foreground"
            >
              <Search size={17} />
            </button>
            <Link
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
              href="/notifications"
              className="relative text-muted-foreground"
            >
              <Bell size={17} />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-1 size-1.5 rounded-full bg-[#dca66b] ring-2 ring-white" />
              )}
            </Link>
            <div className="h-5 w-px bg-border" />
            <Avatar name={data.user.name} tone={1} className="size-8" />
          </div>
        </header>
        <main id="main-content" className="mx-auto max-w-[1550px] px-5 pb-10 pt-8 md:px-9">
          {profile ? children : <Onboarding />}
        </main>
        <footer className="mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-border py-5 text-[9px] text-[#9da99f] md:mx-9">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={12} /> Your care information is shared only with authorised members.
          </span>
          <span>Made for care, together.</span>
        </footer>
      </div>
      <JoinDialog open={join} onOpenChange={setJoin} />
      <Dialog open={search} onOpenChange={setSearch}>
        <DialogContent>
          <DialogTitle>Find something in your care space</DialogTitle>
          <DialogDescription>
            Search the medications, appointments and tasks you have permission to view.
          </DialogDescription>
          <Input
            aria-label="Search"
            placeholder="Medication, doctor, or care task…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="mt-4 max-h-80 space-y-1 overflow-y-auto">
            {query &&
              [
                ...data.medications.map((m) => ({
                  name: `${m.name} · ${m.strength}`,
                  href: "/medications",
                  type: "Medication",
                })),
                ...data.appointments.map((a) => ({
                  name: a.doctor_name,
                  href: "/appointments",
                  type: "Appointment",
                })),
                ...data.assignments.map((a) => ({
                  name: a.title,
                  href: "/handoffs",
                  type: "Care task",
                })),
              ]
                .filter((x) => x.name.toLowerCase().includes(query.toLowerCase()))
                .map((x, i) => (
                  <Link
                    key={i}
                    href={x.href}
                    onClick={() => setSearch(false)}
                    className="flex items-center justify-between rounded-lg p-3 hover:bg-muted"
                  >
                    <span className="text-sm">{x.name}</span>
                    <Badge>{x.type}</Badge>
                  </Link>
                ))}
            {query &&
              ![
                ...data.medications.map((m) => m.name),
                ...data.appointments.map((a) => a.doctor_name),
                ...data.assignments.map((a) => a.title),
              ].some((n) => n.toLowerCase().includes(query.toLowerCase())) && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No matching records.
                </p>
              )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
