import { describe, it, expect } from "vitest";
import { useClassificationRulesPanelMode } from "@/app/features/transactions/useClassificationRulesPanelMode";
import type { ClassificationRule } from "@/shared/types/classification-rule/classification-rule";

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
    expect(useClassificationRulesPanelMode({ isLoading: true, rules: [] })).toBe("loading");
    expect(useClassificationRulesPanelMode({ isLoading: true, rules: [makeRule()] })).toBe("loading");
  });

  it("returns 'empty' when not loading and rules array is empty", () => {
    expect(useClassificationRulesPanelMode({ isLoading: false, rules: [] })).toBe("empty");
  });

  it("returns 'list' when not loading and rules exist", () => {
    expect(useClassificationRulesPanelMode({ isLoading: false, rules: [makeRule()] })).toBe("list");
    expect(
      useClassificationRulesPanelMode({ isLoading: false, rules: [makeRule(), makeRule({ id: "rule-2" })] }),
    ).toBe("list");
  });
});
