import { describe, expect, it } from "vitest";
import { formatFitScore } from "../utils/formatFitScore";
import { formatRemoteType } from "../utils/formatRemoteType";

describe("formatRemoteType", () => {
  it("labels each known remote type", () => {
    expect(formatRemoteType("remote")).toBe("Remote");
    expect(formatRemoteType("hybrid")).toBe("Hybrid");
    expect(formatRemoteType("onsite")).toBe("Onsite");
  });

  it("has nothing to say when the application doesn't", () => {
    expect(formatRemoteType("unknown")).toBeNull();
    expect(formatRemoteType("")).toBeNull();
  });

  it("capitalizes a remote type added on the backend later", () => {
    expect(formatRemoteType("flexible")).toBe("Flexible");
  });
});

describe("formatFitScore", () => {
  it("keeps the Decimal string as sent", () => {
    expect(formatFitScore("85")).toBe("85%");
    expect(formatFitScore("72.50")).toBe("72.50%");
  });

  it("treats only null as no score", () => {
    expect(formatFitScore(null)).toBeNull();
    expect(formatFitScore("0")).toBe("0%");
  });
});
