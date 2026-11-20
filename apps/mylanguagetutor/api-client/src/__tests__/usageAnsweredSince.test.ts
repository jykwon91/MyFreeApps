import { describe, expect, it } from "vitest";
import { usageAnsweredSince } from "../utils/usageAnsweredSince";

const SINCE = 1_000;

describe("usageAnsweredSince", () => {
  it("is true once a request sent at or after the time has answered", () => {
    expect(usageAnsweredSince({ isSuccess: true, isFetching: false, startedTimeStamp: SINCE }, SINCE)).toBe(true);
    expect(usageAnsweredSince({ isSuccess: true, isFetching: false, startedTimeStamp: SINCE + 1 }, SINCE)).toBe(true);
  });

  it("is false for an answer to an earlier request, or before any request", () => {
    expect(usageAnsweredSince({ isSuccess: true, isFetching: false, startedTimeStamp: SINCE - 1 }, SINCE)).toBe(false);
    expect(usageAnsweredSince({ isSuccess: false, isFetching: false }, SINCE)).toBe(false);
  });

  it("is false while the later request is still running, or when it failed", () => {
    expect(usageAnsweredSince({ isSuccess: true, isFetching: true, startedTimeStamp: SINCE + 1 }, SINCE)).toBe(false);
    expect(usageAnsweredSince({ isSuccess: false, isFetching: false, startedTimeStamp: SINCE + 1 }, SINCE)).toBe(false);
  });
});
