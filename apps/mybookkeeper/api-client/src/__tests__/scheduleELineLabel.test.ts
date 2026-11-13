import { describe, expect, it } from "vitest";
import { scheduleELineLabel } from "../utils/scheduleELineLabel";

describe("Schedule E lines", () => {
  it("reads as words", () => {
    expect(scheduleELineLabel("line_5_advertising")).toBe("Line 5 Advertising");
  });
});
