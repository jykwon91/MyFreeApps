import { describe, it, expect } from "vitest";
import { filtersToggleLabel } from "@/shared/utils/filters-toggle-label";

describe("filtersToggleLabel", () => {
  it("is just Filters when nothing is active", () => {
    expect(filtersToggleLabel(0)).toBe("Filters");
  });

  it("names the active count", () => {
    expect(filtersToggleLabel(1)).toBe("Filters, 1 on");
    expect(filtersToggleLabel(3)).toBe("Filters, 3 on");
  });
});
