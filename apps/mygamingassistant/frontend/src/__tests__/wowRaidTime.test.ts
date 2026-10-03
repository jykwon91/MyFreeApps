import { describe, expect, it } from "vitest";
import { TIME_STYLE } from "@/games/wow-forever/data/raidPage";
import {
  formatDiscordTime,
  formatRaidClock,
  formatRaidDay,
  fromNow,
  relativeTime,
  unixIso,
  updatedLabel,
} from "@/games/wow-forever/lib/raidTime";

const EN_UTC = { locale: "en-US", timeZone: "UTC" } as const;
const EN_CHICAGO = { locale: "en-US", timeZone: "America/Chicago" } as const;

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Friday 9 October 2026, 20:00 UTC. */
const PULL_UNIX = 1_791_576_000;
const PULL_MS = PULL_UNIX * SECOND;
const PULL_ISO = "2026-10-09T20:00:00Z";

/** ICU puts a narrow no-break space before "PM"; compare on plain spaces. */
function plain(text: string): string {
  return text.replace(/\s/g, " ");
}

describe("formatDiscordTime", () => {
  it.each([
    [TIME_STYLE.SHORT_TIME, "8:00 PM"],
    [TIME_STYLE.LONG_TIME, "8:00:00 PM"],
    [TIME_STYLE.SHORT_DATE, "10/09/2026"],
    [TIME_STYLE.LONG_DATE, "October 9, 2026"],
  ])("shows style %s as Discord does", (style, expected) => {
    expect(plain(formatDiscordTime(PULL_UNIX, style, PULL_MS, EN_UTC))).toBe(expected);
  });

  it("shows the date-and-time styles with the time after the date", () => {
    expect(plain(formatDiscordTime(PULL_UNIX, TIME_STYLE.SHORT_DATE_TIME, PULL_MS, EN_UTC))).toMatch(
      /^October 9, 2026,? (at )?8:00 PM$/,
    );
    expect(plain(formatDiscordTime(PULL_UNIX, TIME_STYLE.LONG_DATE_TIME, PULL_MS, EN_UTC))).toMatch(
      /^Friday, October 9, 2026,? (at )?8:00 PM$/,
    );
  });

  it("shows the time in the viewer's zone", () => {
    expect(plain(formatDiscordTime(PULL_UNIX, TIME_STYLE.SHORT_TIME, PULL_MS, EN_CHICAGO))).toBe("3:00 PM");
  });

  it("shows R relative to now", () => {
    expect(formatDiscordTime(PULL_UNIX, TIME_STYLE.RELATIVE, PULL_MS - 3 * DAY, EN_UTC)).toBe("in 3 days");
    expect(formatDiscordTime(PULL_UNIX, TIME_STYLE.RELATIVE, PULL_MS + 2 * HOUR, EN_UTC)).toBe("2 hours ago");
  });

  it("leaves a timestamp no date can hold as typed", () => {
    const outOfRange = 9_000_000_000_000_000;
    expect(formatDiscordTime(outOfRange, TIME_STYLE.RELATIVE, PULL_MS, EN_UTC)).toBe("<t:9000000000000000:R>");
    expect(unixIso(outOfRange)).toBeUndefined();
    expect(unixIso(PULL_UNIX)).toBe("2026-10-09T20:00:00.000Z");
  });
});

describe("relativeTime", () => {
  it.each([
    [0, "now"],
    [-400, "now"],
    [30 * SECOND, "in 30 seconds"],
    [-44 * SECOND, "44 seconds ago"],
    [50 * SECOND, "in 1 minute"],
    [-10 * MINUTE, "10 minutes ago"],
    [2 * HOUR, "in 2 hours"],
    [21 * HOUR, "in 21 hours"],
    [23 * HOUR, "tomorrow"],
    [3 * DAY, "in 3 days"],
    [-27 * DAY, "last month"],
    [60 * DAY, "in 2 months"],
    [400 * DAY, "next year"],
  ])("%d ms away reads %s, on Discord's thresholds", (span, expected) => {
    expect(relativeTime(PULL_MS + span, PULL_MS, EN_UTC)).toBe(expected);
  });

  it("is empty for a time that isn't one", () => {
    expect(relativeTime(Number.NaN, PULL_MS, EN_UTC)).toBe("");
  });
});

describe("the header's labels", () => {
  it("shows the day, and the clock with its zone", () => {
    expect(formatRaidDay(PULL_ISO, EN_UTC)).toBe("Fri, Oct 9");
    expect(plain(formatRaidClock(PULL_ISO, EN_UTC))).toBe("8:00 PM UTC");
    expect(plain(formatRaidClock(PULL_ISO, EN_CHICAGO))).toBe("3:00 PM CDT");
    expect(fromNow(PULL_ISO, PULL_MS - 3 * DAY, EN_UTC)).toBe("in 3 days");
  });

  it("is empty for a date that isn't one", () => {
    expect(formatRaidDay("not a date", EN_UTC)).toBe("");
    expect(formatRaidClock("", EN_UTC)).toBe("");
    expect(fromNow("soon", PULL_MS, EN_UTC)).toBe("");
  });
});

describe("updatedLabel", () => {
  it.each([
    [3 * SECOND, "Updated just now"],
    [-2 * SECOND, "Updated just now"],
    [20 * SECOND, "Updated 20 seconds ago"],
    [5 * MINUTE, "Updated 5 minutes ago"],
  ])("%d ms after the read reads %s", (sinceRead, expected) => {
    expect(updatedLabel(PULL_MS - sinceRead, PULL_MS, EN_UTC)).toBe(expected);
  });
});
