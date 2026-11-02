import { z } from "zod";
import { TIME_ZONE } from "./model";

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
export function localDateTime(value: Date) {
  const fields = Object.fromEntries(parts.formatToParts(value).map(({ type, value }) => [type, value]));
  return { date: `${fields.year}-${fields.month}-${fields.day}`, time: `${fields.hour}:${fields.minute}`, seconds: fields.second };
}
export function addDays(date: string, days: number) {
  z.iso.date().parse(date);
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function startOfWeek(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}
export function isoWeek(date: string) {
  const thursday = new Date(`${addDays(startOfWeek(date), 3)}T12:00:00Z`);
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.parse(`${year}-01-01T12:00:00Z`)) / 86400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
export function normalizeTimestamp(value: string) {
  const normalized = value.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  z.iso.datetime({ offset: true }).parse(normalized);
  return new Date(normalized).toISOString();
}
export function midnightCopenhagen(date: string) {
  z.iso.date().parse(date);
  const utc = new Date(`${date}T00:00:00Z`);
  const wall = localDateTime(utc);
  const offset = Date.parse(`${wall.date}T${wall.time}:${wall.seconds}Z`) - utc.getTime();
  return new Date(utc.getTime() - offset);
}
export function aulaTimestamp(value: Date) {
  const wall = localDateTime(value);
  const offset = Math.round((Date.parse(`${wall.date}T${wall.time}:${wall.seconds}Z`) - value.getTime()) / 60_000);
  const zone = `${offset < 0 ? "-" : "+"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}${String(Math.abs(offset) % 60).padStart(2, "0")}`;
  return `${wall.date} ${wall.time}:${wall.seconds}.0000${zone}`;
}
export function liveWindow(now = new Date()) {
  const today = localDateTime(now).date;
  const windowEnd = addDays(today, 30);
  return { today, windowEnd, start: aulaTimestamp(midnightCopenhagen(today)), end: aulaTimestamp(midnightCopenhagen(windowEnd)) };
}
