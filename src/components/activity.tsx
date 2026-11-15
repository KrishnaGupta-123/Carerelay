"use client";
import { useState } from "react";
import { Activity as ActivityIcon, Search, Info } from "lucide-react";
import { useCare } from "./care-provider";
import { PageHeading } from "./page-heading";
import { Card, EmptyState, Badge } from "./ui/common";
import { Input, Select } from "./ui/fields";
import { ActivityList } from "./activity-list";
export function ActivityPage() {
  const { data } = useCare();
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const events = data.audit.filter(
    (a) =>
      (type === "all" || a.entity_type === type) &&
      `${a.action} ${a.actor_name} ${JSON.stringify(a.details)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="Every update, in the open"
        title="Care timeline"
        description="A shared record of medication changes, dose reports, handoffs, appointments, and access."
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search size={15} className="absolute left-3 top-3 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label="Search care timeline"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an update or person…"
          />
        </div>
        <Select
          aria-label="Activity type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-44"
        >
          <option value="all">All activity</option>
          <option value="medication">Medication changes</option>
          <option value="dose">Dose reports</option>
          <option value="assignment">Care handoffs</option>
          <option value="appointment">Appointments</option>
          <option value="member">Members & access</option>
          <option value="invitation">Invitations</option>
          <option value="profile">Profile & preferences</option>
        </Select>
        <Badge className="ml-auto">{events.length} updates</Badge>
      </div>
      <Card>
        {events.length ? (
          <ActivityList compact={false} events={events} />
        ) : (
          <EmptyState
            icon={ActivityIcon}
            title="No matching care activity"
            description="Important updates are recorded automatically and will appear here. Try another filter or search."
          />
        )}
      </Card>
      <p className="mt-5 flex items-center gap-2 text-xs leading-6 text-muted-foreground">
        <Info size={14} />
        This timeline records actions and reports. It does not independently confirm medication
        ingestion or clinical correctness.
      </p>
    </div>
  );
}
