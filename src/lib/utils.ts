import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { DoseStatus, Role } from "./types";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const roleLabels: Record<Role, string> = {
  owner: "Profile owner",
  coordinator: "Family coordinator",
  caretaker: "Backup caretaker",
  viewer: "Family viewer",
};
export const statusLabels: Record<DoseStatus, string> = {
  scheduled: "Scheduled",
  self_reported_taken: "Reported taken",
  assisted_recorded: "Assistance recorded",
  declined: "Declined",
  needs_help: "Needs help",
  unconfirmed: "Unconfirmed",
  explicitly_missed: "Reported missed",
};
export const resolvedStatuses: DoseStatus[] = [
  "self_reported_taken",
  "assisted_recorded",
  "declined",
  "explicitly_missed",
];
export function canManage(role?: Role) {
  return role === "owner" || role === "coordinator";
}
export function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}
export function localDate(date: string | Date, tz = "Asia/Kolkata") {
  return formatInTimeZone(date, tz, "yyyy-MM-dd");
}
export function localTime(date: string | Date, tz = "Asia/Kolkata") {
  return formatInTimeZone(date, tz, "h:mm a");
}
export function prettyDate(date: string | Date, tz = "Asia/Kolkata", pattern = "EEE, d MMM") {
  return formatInTimeZone(date, tz, pattern);
}
export function appointmentISO(date: string, time: string, tz: string) {
  return fromZonedTime(`${date}T${time}`, tz).toISOString();
}
export function shortName(name = "") {
  return name.split(" ")[0];
}
