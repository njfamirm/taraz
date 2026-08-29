import { format as formatJalali, startOfDay } from "date-fns-jalali";
import { toPersianDigits } from "./money.ts";

export function formatJalaliDate(ts: number): string {
  return toPersianDigits(formatJalali(ts, "yyyy/MM/dd"));
}

export function formatJalaliTime(ts: number): string {
  return toPersianDigits(formatJalali(ts, "HH:mm"));
}

export function formatJalaliMonth(ts: number): string {
  return toPersianDigits(formatJalali(ts, "MMMM yyyy"));
}

/** Relative label for recent days, falling back to a Jalali date. */
export function formatRelativeDay(ts: number, now: number = Date.now()): string {
  const dayMs = 86_400_000;
  const diff = Math.round((startOfDay(now).getTime() - startOfDay(ts).getTime()) / dayMs);
  if (diff === 0) return "امروز";
  if (diff === 1) return "دیروز";
  if (diff === 2) return "پریروز";
  return formatJalaliDate(ts);
}

/** Value for <input type="datetime-local"> in local time. */
export function toDateTimeLocal(ts: number): string {
  const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}
