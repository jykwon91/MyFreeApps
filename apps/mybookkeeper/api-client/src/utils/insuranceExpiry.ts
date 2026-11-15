import { differenceInCalendarDays, parseISO } from "date-fns";
import { EXPIRES_SOON_DAYS, EXPIRY_MESSAGES } from "../constants/insuranceExpiry";

/** Calendar days from today to a date-only expiry (negative once past), so the time of day never moves it. */
export function daysUntilExpiry(expirationDate: string, todayIso: string): number {
  return differenceInCalendarDays(parseISO(expirationDate), parseISO(todayIso));
}

/** Null while a policy has a good while left, so a label always means look at this. */
export function expiryLabel(expirationDate: string | null, todayIso: string): string | null {
  if (!expirationDate) return null;
  const days = daysUntilExpiry(expirationDate, todayIso);
  if (days < -1) return EXPIRY_MESSAGES.expiredDaysAgo(-days);
  if (days === -1) return EXPIRY_MESSAGES.expiredYesterday;
  if (days === 0) return EXPIRY_MESSAGES.expiresToday;
  if (days === 1) return EXPIRY_MESSAGES.expiresTomorrow;
  return days <= EXPIRES_SOON_DAYS ? EXPIRY_MESSAGES.expiresInDays(days) : null;
}
