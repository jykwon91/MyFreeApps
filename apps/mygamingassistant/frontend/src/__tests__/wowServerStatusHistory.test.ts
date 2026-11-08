/**
 * WoW Forever server status history — the pure timeline, uptime, outage, streak and login-error search logic.
 */
import { describe, expect, it } from "vitest";
import { PROVENANCE_DETAIL } from "@/games/wow-forever/data/provenance/provenanceLabels";
import { LOGIN_ERRORS } from "@/games/wow-forever/data/serverStatus/loginErrors";
import { formatDuration } from "@/games/wow-forever/lib/serverStatus/formatDuration";
import { formatLocalDateTime } from "@/games/wow-forever/lib/serverStatus/formatLocalTime";
import { parseHistoryRange, writeHistoryRange } from "@/games/wow-forever/lib/serverStatus/historyRangeParam";
import { listOutages } from "@/games/wow-forever/lib/serverStatus/outages";
import { loginErrorAnchor, searchLoginErrors } from "@/games/wow-forever/lib/serverStatus/searchLoginErrors";
import { streakLine } from "@/games/wow-forever/lib/serverStatus/streakLine";
import { buildSegments, clipSegments, rulesetTimeline } from "@/games/wow-forever/lib/serverStatus/timeline";
import { formatUptime, uptimePercent } from "@/games/wow-forever/lib/serverStatus/uptime";
import type { RulesetHistory } from "@/games/wow-forever/types/serverStatus/rulesetHistory";
import type { ServerStatusPoint } from "@/games/wow-forever/types/serverStatus/serverStatusPoint";

const MIN = 60_000;
const HOUR = 60 * MIN;
const MAX_GAP = 70 * MIN;
const T0 = Date.parse("2026-11-07T00:00:00Z");

function at(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

function point(offsetMs: number, status: "up" | "down"): ServerStatusPoint {
  return { at: at(offsetMs), status };
}

function ruleset(points: ServerStatusPoint[], since: string | null, sinceExact = true): RulesetHistory {
  return { slug: "normal", name: "Normal", since, since_exact: sinceExact, points };
}

describe("buildSegments", () => {
  it("holds each point until the next one and merges equal neighbours", () => {
    const points = [point(0, "up"), point(HOUR, "up"), point(2 * HOUR, "down"), point(2.5 * HOUR, "up")];
    expect(buildSegments(points, T0 + 3 * HOUR, MAX_GAP)).toEqual([
      { start: T0, end: T0 + 2 * HOUR, status: "up" },
      { start: T0 + 2 * HOUR, end: T0 + 2.5 * HOUR, status: "down" },
      { start: T0 + 2.5 * HOUR, end: T0 + 3 * HOUR, status: "up" },
    ]);
  });

  it("turns a gap longer than the max into unknown, never up or down", () => {
    const points = [point(0, "up"), point(5 * HOUR, "up")];
    expect(buildSegments(points, T0 + 6 * HOUR, MAX_GAP)).toEqual([
      { start: T0, end: T0 + MAX_GAP, status: "up" },
      { start: T0 + MAX_GAP, end: T0 + 5 * HOUR, status: "unknown" },
      { start: T0 + 5 * HOUR, end: T0 + 6 * HOUR, status: "up" },
    ]);
  });

  it("goes unknown after the last point once the recorder has been quiet too long", () => {
    expect(buildSegments([point(0, "down")], T0 + 3 * HOUR, MAX_GAP)).toEqual([
      { start: T0, end: T0 + MAX_GAP, status: "down" },
      { start: T0 + MAX_GAP, end: T0 + 3 * HOUR, status: "unknown" },
    ]);
  });

  it("is empty with no points", () => {
    expect(buildSegments([], T0, MAX_GAP)).toEqual([]);
  });
});

describe("clipSegments / rulesetTimeline", () => {
  it("cuts to the window and fills the uncovered start with unknown", () => {
    const segments = [{ start: T0 + HOUR, end: T0 + 3 * HOUR, status: "up" as const }];
    expect(clipSegments(segments, T0, T0 + 2 * HOUR)).toEqual([
      { start: T0, end: T0 + HOUR, status: "unknown" },
      { start: T0 + HOUR, end: T0 + 2 * HOUR, status: "up" },
    ]);
  });

  it("uses the point before the window as the status the window opens with", () => {
    const points = [point(-30 * MIN, "down"), point(30 * MIN, "up")];
    expect(rulesetTimeline(points, T0, T0 + HOUR, MAX_GAP)).toEqual([
      { start: T0, end: T0 + 30 * MIN, status: "down" },
      { start: T0 + 30 * MIN, end: T0 + HOUR, status: "up" },
    ]);
  });

  it("covers the whole window, start to end", () => {
    const segments = rulesetTimeline([point(2 * HOUR, "up")], T0, T0 + 24 * HOUR, MAX_GAP);
    expect(segments[0].start).toBe(T0);
    expect(segments[segments.length - 1].end).toBe(T0 + 24 * HOUR);
    segments.slice(1).forEach((s, i) => expect(s.start).toBe(segments[i].end));
  });
});

describe("uptimePercent / formatUptime", () => {
  it("counts only recorded time", () => {
    const segments = [
      { start: 0, end: 30, status: "up" as const },
      { start: 30, end: 40, status: "down" as const },
      { start: 40, end: 100, status: "unknown" as const },
    ];
    expect(uptimePercent(segments)).toBe(75);
  });

  it("is null when nothing was recorded", () => {
    expect(uptimePercent([{ start: 0, end: 10, status: "unknown" }])).toBeNull();
  });

  it("never rounds downtime up to 100%", () => {
    expect(formatUptime(99.99)).toBe("99.9%");
    expect(formatUptime(100)).toBe("100%");
    expect(formatUptime(75)).toBe("75%");
    expect(formatUptime(0)).toBe("0%");
  });
});

describe("listOutages", () => {
  const now = T0 + 10 * HOUR;

  it("lists finished and ongoing outages newest first", () => {
    const rulesets: RulesetHistory[] = [
      ruleset([point(0, "up"), point(HOUR, "down"), point(90 * MIN, "up"), point(9 * HOUR, "up")], at(90 * MIN)),
      {
        slug: "pvp",
        name: "PvP",
        since: at(9.5 * HOUR),
        since_exact: true,
        points: [point(9 * HOUR, "up"), point(9.5 * HOUR, "down")],
      },
    ];
    expect(listOutages(rulesets, T0, now, MAX_GAP)).toEqual([
      { slug: "pvp", name: "PvP", start: T0 + 9.5 * HOUR, end: null },
      { slug: "normal", name: "Normal", start: T0 + HOUR, end: T0 + 90 * MIN },
    ]);
  });

  it("ends an outage where the recording stopped, not now", () => {
    const outages = listOutages([ruleset([point(0, "down")], at(0))], T0, now, MAX_GAP);
    expect(outages).toEqual([{ slug: "normal", name: "Normal", start: T0, end: T0 + MAX_GAP }]);
  });

  it("keeps an outage that began before the window but ended inside it, with its real start", () => {
    const outages = listOutages([ruleset([point(-HOUR, "down"), point(-HOUR + MAX_GAP - MIN, "up")], null)], T0, now, MAX_GAP);
    expect(outages).toEqual([{ slug: "normal", name: "Normal", start: T0 - HOUR, end: T0 - HOUR + MAX_GAP - MIN }]);
  });

  it("drops outages that ended before the window", () => {
    expect(listOutages([ruleset([point(-5 * HOUR, "down"), point(-4 * HOUR, "up")], null)], T0, now, MAX_GAP)).toEqual([]);
  });
});

describe("formatDuration", () => {
  it.each([
    [30_000, "under a minute"],
    [45 * MIN, "45 min"],
    [2 * HOUR, "2 h"],
    [2 * HOUR + 5 * MIN, "2 h 5 min"],
    [3 * 24 * HOUR + 4 * HOUR + 10 * MIN, "3 d 4 h"],
    [2 * 24 * HOUR, "2 d"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("streakLine", () => {
  const now = T0 + 3 * HOUR;

  it("says how long it's been up", () => {
    expect(streakLine(ruleset([point(2.9 * HOUR, "up")], at(0)), now, MAX_GAP)).toBe("Up for 3 h");
  });

  it("says 'at least' when the streak is older than the history kept", () => {
    expect(streakLine(ruleset([point(2.9 * HOUR, "up")], at(0), false), now, MAX_GAP)).toBe("Up for at least 3 h");
  });

  it("says since when it's been down, in the given time zone", () => {
    const line = streakLine(ruleset([point(2.9 * HOUR, "down")], at(HOUR)), now, MAX_GAP, "UTC");
    expect(line).toBe(`Down since ${formatLocalDateTime(T0 + HOUR, "UTC")}`);
  });

  it("says there's no recent data when the newest point is too old or nothing is stored", () => {
    expect(streakLine(ruleset([point(0, "up")], at(0)), now, MAX_GAP)).toBe("No recent data");
    expect(streakLine(ruleset([], null), now, MAX_GAP)).toBe("No recent data");
  });
});

describe("formatLocalDateTime", () => {
  it("renders the moment in the given time zone", () => {
    const utc = formatLocalDateTime(T0, "UTC");
    const tokyo = formatLocalDateTime(T0, "Asia/Tokyo");
    expect(tokyo).toMatch(/9/);
    expect(utc).not.toBe(tokyo);
  });
});

describe("history range param", () => {
  it("reads 7d, and anything else as the 24h default", () => {
    expect(parseHistoryRange(new URLSearchParams("range=7d"))).toBe("7d");
    expect(parseHistoryRange(new URLSearchParams("range=bogus"))).toBe("24h");
    expect(parseHistoryRange(new URLSearchParams())).toBe("24h");
  });

  it("leaves the default out of the URL and keeps other params", () => {
    expect(writeHistoryRange(new URLSearchParams("x=1"), "7d").toString()).toBe("x=1&range=7d");
    expect(writeHistoryRange(new URLSearchParams("x=1&range=7d"), "24h").toString()).toBe("x=1");
  });
});

describe("searchLoginErrors", () => {
  function ids(query: string): string[] {
    return searchLoginErrors(LOGIN_ERRORS, query).map((e) => e.id);
  }

  it("keeps every entry for an empty query", () => {
    expect(ids("  ")).toHaveLength(LOGIN_ERRORS.length);
  });

  it("finds an error by its full code, any case", () => {
    expect(ids("wow51900319")).toEqual(["wow51900319"]);
    expect(ids("BLZ51900003")).toEqual(["blz51900003"]);
  });

  it("finds an error by the digits only, or with spaces / dashes", () => {
    expect(ids("51900319")).toEqual(["wow51900319"]);
    expect(ids("WOW-51900319")).toEqual(["wow51900319"]);
    expect(ids("blz 51900003")).toEqual(["blz51900003"]);
  });

  it("finds an error by words from its message, in any order", () => {
    expect(ids("character not found")).toContain("character-not-found");
    expect(ids("stuck transferring")).toContain("transferring-stuck");
    expect(ids("Logging in to game server")).toContain("logging-in-stuck");
    expect(ids("queue")).toContain("realm-queue");
    expect(ids("unable to connect")).toContain("unable-to-connect");
  });

  it("returns nothing for words no entry has", () => {
    expect(ids("zzqx")).toEqual([]);
  });
});

describe("LOGIN_ERRORS data", () => {
  it("has unique, link-safe anchors", () => {
    const anchors = LOGIN_ERRORS.map(loginErrorAnchor);
    expect(new Set(anchors).size).toBe(anchors.length);
    anchors.forEach((a) => expect(a).toMatch(/^err-[a-z0-9-]+$/));
  });

  it("covers the errors players hit most", () => {
    const ids = LOGIN_ERRORS.map((e) => e.id);
    for (const id of ["wow51900319", "blz51900003", "unable-to-connect", "character-not-found", "logging-in-stuck", "transferring-stuck", "realm-queue"]) {
      expect(ids).toContain(id);
    }
  });

  it("tags every entry Unconfirmed with the our-own-advice detail (no Blizzard article is linked)", () => {
    LOGIN_ERRORS.forEach((e) => {
      expect(e.provenance.provenance).toBe("unconfirmed");
      expect(e.provenance.detail).toBe(PROVENANCE_DETAIL.loginHelp);
      expect(e.steps.length).toBeGreaterThan(0);
      expect(e.meaning.length).toBeGreaterThan(0);
    });
  });
});
