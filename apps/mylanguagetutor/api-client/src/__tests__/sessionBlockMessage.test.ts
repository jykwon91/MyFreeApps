import { describe, expect, it } from "vitest";
import { SESSION_BLOCK_COPY } from "../constants/sessionBlockCopy";
import { dailyResetWhen } from "../utils/dailyResetMessage";
import { nextUtcMidnight } from "../utils/nextUtcMidnight";
import { sessionBlockMessage } from "../utils/sessionBlockMessage";

const CHICAGO = "America/Chicago";
// 5:00 PM in Chicago (CST, UTC-6) on 15 Nov 2026.
const FIVE_PM_CHICAGO = new Date("2026-11-15T23:00:00Z");

describe("nextUtcMidnight", () => {
  it("is the coming 00:00 UTC, even at the last second of the UTC day", () => {
    expect(nextUtcMidnight(FIVE_PM_CHICAGO).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(nextUtcMidnight(new Date("2026-11-15T23:59:59Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(nextUtcMidnight(new Date("2026-11-16T00:00:00Z")).toISOString()).toBe("2026-11-17T00:00:00.000Z");
  });
});

describe("dailyResetWhen", () => {
  it("tells a Chicago learner it resets this evening, not tomorrow", () => {
    expect(dailyResetWhen(FIVE_PM_CHICAGO, CHICAGO)).toBe("today at 6:00 PM");
  });

  it("follows daylight saving", () => {
    expect(dailyResetWhen(new Date("2026-07-15T22:00:00Z"), CHICAGO)).toBe("today at 7:00 PM");
  });

  it("says tomorrow when the reset falls after the learner's midnight", () => {
    expect(dailyResetWhen(new Date("2026-11-15T10:00:00Z"), "Asia/Tokyo")).toBe("tomorrow at 9:00 AM");
  });
});

describe("sessionBlockMessage", () => {
  it("names the real reset time for the daily limit", () => {
    expect(sessionBlockMessage("daily_limit", FIVE_PM_CHICAGO, CHICAGO)).toBe(
      "You've used today's practice time. It resets today at 6:00 PM.",
    );
  });

  it("leaves the other blocks' wording alone", () => {
    expect(sessionBlockMessage("unavailable")).toBe(SESSION_BLOCK_COPY.unavailable);
    expect(sessionBlockMessage("session_ended")).toBe(SESSION_BLOCK_COPY.session_ended);
  });
});
