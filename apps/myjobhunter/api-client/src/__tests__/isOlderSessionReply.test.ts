import { describe, expect, it } from "vitest";
import { isOlderSessionReply } from "../utils/isOlderSessionReply";

describe("isOlderSessionReply", () => {
  it("is true for a session from before the one shown", () => {
    expect(isOlderSessionReply({ turn_count: 3 }, { turn_count: 4 })).toBe(true);
  });

  it("is false for one as new or newer, such as a move to another suggestion", () => {
    expect(isOlderSessionReply({ turn_count: 4 }, { turn_count: 4 })).toBe(false);
    expect(isOlderSessionReply({ turn_count: 5 }, { turn_count: 4 })).toBe(false);
  });
});
