import { describe, it, expect } from "vitest";
import { useApplicantsListMode } from "@/app/features/applicants/useApplicantsListMode";

describe("useApplicantsListMode", () => {
  it("returns 'loading' when isLoading is true", () => {
    expect(useApplicantsListMode({ isLoading: true, isEmpty: false })).toBe("loading");
  });

  it("returns 'loading' even when isEmpty is also true (loading takes precedence)", () => {
    expect(useApplicantsListMode({ isLoading: true, isEmpty: true })).toBe("loading");
  });

  it("returns 'empty' when not loading and list is empty", () => {
    expect(useApplicantsListMode({ isLoading: false, isEmpty: true })).toBe("empty");
  });

  it("returns 'list' when not loading and list has items", () => {
    expect(useApplicantsListMode({ isLoading: false, isEmpty: false })).toBe("list");
  });
});
