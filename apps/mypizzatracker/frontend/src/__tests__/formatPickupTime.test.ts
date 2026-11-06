import { describe, expect, it } from "vitest";

import { formatPickupTime } from "@/features/service/formatPickupTime";

describe("formatPickupTime", () => {
  it("drops the seconds", () => {
    expect(formatPickupTime("17:30:00")).toBe("17:30");
  });
  it("keeps a short time as-is", () => {
    expect(formatPickupTime("9:5")).toBe("9:5");
  });
  it("shows ? when the slot has no time", () => {
    expect(formatPickupTime(undefined)).toBe("?");
  });
});
