import { describe, it, expect } from "vitest";
import { useClassificationRulesPanelMode } from "@/app/features/transactions/useClassificationRulesPanelMode";
import type { ClassificationRule } from "@mybookkeeper/api-client/types/classification-rule/classification-rule";

function makeRule(override?: Partial<ClassificationRule>): ClassificationRule {
  return {
    id: "rule-1",
    organization_id: "org-1",
    match_type: "contains",
    match_pattern: "Home Depot",
    match_context: null,
    category: "repairs",
    property_id: null,
    activity_id: null,
    source: "user",
    priority: 1,
    times_applied: 3,
    is_active: true,
    created_at: "2025-01-01T00:00:00Z",
    ...override,
  };
}

describe("useClassificationRulesPanelMode", () => {
  it("returns 'loading' when isLoading is true regardless of rules", () => {
    expect(useClassificationRulesPanelMode({ isLoading: true, isError: false, rules: [] })).toBe("loading");
    expect(useClassificationRulesPanelMode({ isLoading: true, isError: false, rules: [makeRule()] })).toBe("loading");
  });

  it("returns 'empty' when not loading and rules array is empty", () => {
    expect(useClassificationRulesPanelMode({ isLoading: false, isError: false, rules: [] })).toBe("empty");
  });

  it("returns 'list' when not loading and rules exist", () => {
    expect(useClassificationRulesPanelMode({ isLoading: false, isError: false, rules: [makeRule()] })).toBe("list");
    expect(
      useClassificationRulesPanelMode({ isLoading: false, isError: false, rules: [makeRule(), makeRule({ id: "rule-2" })] }),
    ).toBe("list");
  });

  it("returns 'error' when the load failed and nothing is cached", () => {
    expect(useClassificationRulesPanelMode({ isLoading: false, isError: true, rules: [] })).toBe("error");
  });

  it("keeps showing cached rules when a reload failed", () => {
    expect(useClassificationRulesPanelMode({ isLoading: false, isError: true, rules: [makeRule()] })).toBe("list");
  });

  it("prefers 'loading' over 'error'", () => {
    expect(useClassificationRulesPanelMode({ isLoading: true, isError: true, rules: [] })).toBe("loading");
  });
});
