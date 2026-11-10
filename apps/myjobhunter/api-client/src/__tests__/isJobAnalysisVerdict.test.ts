import { describe, expect, it } from "vitest";
import { isJobAnalysisVerdict } from "../utils/isJobAnalysisVerdict";

describe("isJobAnalysisVerdict", () => {
  it("accepts every known verdict", () => {
    for (const verdict of ["strong_fit", "worth_considering", "stretch", "mismatch"]) {
      expect(isJobAnalysisVerdict(verdict)).toBe(true);
    }
  });

  it("rejects a verdict the client doesn't know", () => {
    expect(isJobAnalysisVerdict("long_shot")).toBe(false);
  });

  it("rejects names inherited from Object.prototype", () => {
    expect(isJobAnalysisVerdict("toString")).toBe(false);
    expect(isJobAnalysisVerdict("constructor")).toBe(false);
  });
});
