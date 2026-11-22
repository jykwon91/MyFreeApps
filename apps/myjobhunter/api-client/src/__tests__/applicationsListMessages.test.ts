import { describe, expect, it } from "vitest";
import { applicationsShowingCount } from "../constants/applicationsListMessages";

describe("applicationsShowingCount", () => {
  it("says how many of the total are showing", () => {
    expect(applicationsShowingCount(25, 60)).toBe("Showing 25 of 60 applications");
  });
});
