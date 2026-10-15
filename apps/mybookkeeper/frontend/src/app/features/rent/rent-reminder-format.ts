import { formatShortDate } from "@/shared/lib/inquiry-date-format";
import { WEEKDAY_NAMES } from "./rent-reminder-labels";
import type { RentReminderPlan } from "@/shared/types/rent/rent-reminder-plan";

/** "18:00" or "18:00:00" → "6:00 PM". */
export function formatSendTime(time: string): string {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:${minuteText} ${suffix}`;
}

/** "18:00:00" → "18:00", the shape an `<input type="time">` wants. */
export function toTimeInputValue(time: string): string {
  return time.slice(0, 5);
}

/** An ISO timestamp as a wall-clock moment in `timeZone`: "Sat, Oct 31, 6:00 PM". */
export function formatSendMoment(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "2026-11-01" → "Sun, Nov 1", without the UTC-midnight off-by-one. */
export function formatDueDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
  });
  return `${weekday}, ${formatShortDate(isoDate)}`;
}

function daysBeforeText(days: number): string {
  if (days === 0) return "on the day";
  if (days === 1) return "the day before";
  return `${days} days before`;
}

/** One-line summary: "Weekly, due every Sunday · reminded the day before at 6:00 PM". */
export function describePlan(plan: RentReminderPlan): string {
  const cadence =
    plan.frequency === "weekly" && plan.due_weekday !== null
      ? `Weekly, due every ${WEEKDAY_NAMES[plan.due_weekday]}`
      : "Monthly, due on the 1st";
  return `${cadence} · reminded ${daysBeforeText(plan.send_days_before)} at ${formatSendTime(plan.send_time)}`;
}
