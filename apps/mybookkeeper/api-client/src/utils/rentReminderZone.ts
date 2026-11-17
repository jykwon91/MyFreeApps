import { DEFAULT_TIMEZONE } from "../constants/rentReminderDefaults";

function isKnownZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The zone this device is set to, or the app default when the runtime can't say (or names one it can't use). */
export function deviceTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isKnownZone(zone) ? zone : DEFAULT_TIMEZONE;
}

/** The send-time field label, naming the zone the time is read in: "At (CST)". */
export function sendTimeLabel(timeZone: string, at: Date = new Date()): string {
  return `At (${zoneAbbreviation(timeZone, at)})`;
}

/** The zone's short name as it reads at `at`: "CST" in winter, "CDT" in summer, "PST", "GMT+1". */
export function zoneAbbreviation(timeZone: string, at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}
