import { describe, expect, it } from "vitest";
import { referenceRelationshipLabel } from "../utils/applicantReferenceLabel";

describe("referenceRelationshipLabel", () => {
  it("reads a known relationship in words", () => {
    expect(referenceRelationshipLabel("landlord")).toBe("Previous landlord");
  });
  it("keeps an unknown one as it came", () => {
    expect(referenceRelationshipLabel("neighbor")).toBe("neighbor");
  });
});
