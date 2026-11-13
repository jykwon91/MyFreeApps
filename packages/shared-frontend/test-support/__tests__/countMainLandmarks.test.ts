import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAIN_LANDMARK_POLL_INTERVAL_MS } from "../constants/mainLandmarkPollInterval";
import { MAIN_LANDMARK_SETTLE_TIMEOUT_MS } from "../constants/mainLandmarkSettleTimeout";
import { MAIN_LANDMARK_STEADY_MS } from "../constants/mainLandmarkSteady";
import { countMainLandmarks } from "../countMainLandmarks";
import type { MainLandmarkPage } from "../types/MainLandmarkPage";
import type { MainLandmarkReading } from "../types/MainLandmarkReading";

const BASE_URL = "http://localhost:5173";
const LOGIN = `${BASE_URL}/login`;
const ELSEWHERE = "https://accounts.example.com/sign-in";

interface FakeTab {
  url: string;
  closed: boolean;
  reads: number;
}

/** A page whose n-th count (from 1) is `read(n, tab)`; `read` may close or move the tab. */
function fakePage(tab: FakeTab, read: (n: number, tab: FakeTab) => Promise<number>): MainLandmarkPage {
  return {
    isClosed: () => tab.closed,
    url: () => tab.url,
    getByRole: () => ({
      count: () => {
        tab.reads += 1;
        return read(tab.reads, tab);
      },
    }),
  };
}

function tabAt(url: string, closed = false): FakeTab {
  return { url, closed, reads: 0 };
}

/** Runs the count, advancing fake time by `ms`, and returns its result or "pending". */
async function countAfter(page: MainLandmarkPage, ms: number): Promise<MainLandmarkReading | "pending"> {
  let result: MainLandmarkReading | "pending" = "pending";
  void countMainLandmarks(page, BASE_URL).then((reading) => {
    result = reading;
  });
  await vi.advanceTimersByTimeAsync(ms);
  return result;
}

const NEVER = new Promise<number>(() => {});

describe("countMainLandmarks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts one main straight away", async () => {
    const tab = tabAt(LOGIN);

    expect(await countAfter(fakePage(tab, async () => 1), 0)).toEqual({ kind: "counted", url: LOGIN, count: 1 });
    expect(tab.reads).toBe(1);
  });

  it("keeps counting while the page settles, until it has one", async () => {
    const counts = [0, 2, 1];
    const page = fakePage(tabAt(LOGIN), async (n) => counts[n - 1] ?? 1);

    expect(await countAfter(page, 3 * MAIN_LANDMARK_POLL_INTERVAL_MS)).toEqual({ kind: "counted", url: LOGIN, count: 1 });
  });

  it("reports a wrong count that holds steady without waiting out the settle timeout", async () => {
    const page = fakePage(tabAt(LOGIN), async () => 0);

    const reading = await countAfter(page, MAIN_LANDMARK_STEADY_MS + 2 * MAIN_LANDMARK_POLL_INTERVAL_MS);

    expect(MAIN_LANDMARK_STEADY_MS + 2 * MAIN_LANDMARK_POLL_INTERVAL_MS).toBeLessThan(MAIN_LANDMARK_SETTLE_TIMEOUT_MS);
    expect(reading).toEqual({ kind: "counted", url: LOGIN, count: 0 });
  });

  it("waits out the settle timeout for a count that keeps changing, and reports the last one", async () => {
    const page = fakePage(tabAt(LOGIN), async (n) => (n % 2 === 0 ? 2 : 0));

    expect(await countAfter(page, MAIN_LANDMARK_SETTLE_TIMEOUT_MS - MAIN_LANDMARK_POLL_INTERVAL_MS)).toBe("pending");
    const reading = await countAfter(page, MAIN_LANDMARK_SETTLE_TIMEOUT_MS + MAIN_LANDMARK_POLL_INTERVAL_MS);
    expect(reading).toMatchObject({ kind: "counted", url: LOGIN });
  });

  it("gives up on a page that never answers once the settle timeout passes", async () => {
    const page = fakePage(tabAt(LOGIN), () => NEVER);

    expect(await countAfter(page, MAIN_LANDMARK_SETTLE_TIMEOUT_MS)).toEqual({ kind: "counted", url: LOGIN, count: null });
  });

  it("keeps the last count when the page stops answering", async () => {
    const page = fakePage(tabAt(LOGIN), (n) => (n === 1 ? Promise.resolve(2) : NEVER));

    expect(await countAfter(page, MAIN_LANDMARK_SETTLE_TIMEOUT_MS)).toEqual({ kind: "counted", url: LOGIN, count: 2 });
  });

  it("skips a page that is already closed", async () => {
    const tab = tabAt(LOGIN, true);

    expect(await countAfter(fakePage(tab, () => Promise.reject(new Error("closed"))), 0)).toEqual({ kind: "skipped", url: LOGIN });
    expect(tab.reads).toBe(0);
  });

  it("skips a page that closes while it is being counted (a popup's window.close())", async () => {
    const page = fakePage(tabAt(LOGIN), async (n, tab) => {
      if (n === 1) return 0;
      tab.closed = true;
      throw new Error("Target page, context or browser has been closed");
    });

    expect(await countAfter(page, MAIN_LANDMARK_SETTLE_TIMEOUT_MS)).toEqual({ kind: "skipped", url: LOGIN });
  });

  it("skips a page on another origin", async () => {
    const tab = tabAt(ELSEWHERE);

    expect(await countAfter(fakePage(tab, async () => 0), 0)).toEqual({ kind: "skipped", url: ELSEWHERE });
    expect(tab.reads).toBe(0);
  });

  it("skips a page that navigates to another origin while it is being counted", async () => {
    const page = fakePage(tabAt(LOGIN), async (n, tab) => {
      if (n === 2) tab.url = ELSEWHERE;
      return 0;
    });

    expect(await countAfter(page, MAIN_LANDMARK_SETTLE_TIMEOUT_MS)).toEqual({ kind: "skipped", url: ELSEWHERE });
  });
});
