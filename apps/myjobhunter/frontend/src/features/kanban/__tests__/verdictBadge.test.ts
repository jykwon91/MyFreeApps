import { describe, expect, it } from "vitest";
import { colorForVerdict, labelForVerdict } from "../verdictBadge";

describe("labelForVerdict", () => {
  it("uses the shared label for a known verdict", () => {
    expect(labelForVerdict("strong_fit")).toBe("Strong fit");
    expect(labelForVerdict("worth_considering")).toBe("Worth considering");
  });

  it("shows an unknown verdict as-is", () => {
    expect(labelForVerdict("long_shot")).toBe("long_shot");
  });

  it("shows nothing without a verdict", () => {
    expect(labelForVerdict(null)).toBeNull();
    expect(labelForVerdict("")).toBeNull();
  });
});

describe("colorForVerdict", () => {
  it("colours each known verdict", () => {
    expect(colorForVerdict("strong_fit")).toBe("green");
    expect(colorForVerdict("worth_considering")).toBe("blue");
    expect(colorForVerdict("stretch")).toBe("yellow");
    expect(colorForVerdict("mismatch")).toBe("red");
  });

  it("falls back to blue for an unknown or missing verdict", () => {
    expect(colorForVerdict("long_shot")).toBe("blue");
    expect(colorForVerdict(null)).toBe("blue");
  });
});
