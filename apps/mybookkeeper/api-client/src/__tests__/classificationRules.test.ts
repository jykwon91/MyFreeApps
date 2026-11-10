import { describe, expect, it } from "vitest";
import type { ClassificationRule } from "../types/classification-rule/classification-rule";
import { filterRulesByMatchType, groupRulesByMatchType, matchTypeLabel, ruleSourceLabel } from "../utils/classificationRules";

const rule = (id: string, match_type: string): ClassificationRule => ({
  id,
  organization_id: "o1",
  match_type,
  match_pattern: id,
  match_context: null,
  category: "maintenance",
  property_id: null,
  activity_id: null,
  source: "manual",
  priority: 0,
  times_applied: 0,
  is_active: true,
  created_at: "2026-10-01T00:00:00Z",
});

describe("classification rule helpers", () => {
  it("labels known match types and passes unknown ones through", () => {
    expect(matchTypeLabel("document_type")).toBe("Document type");
    expect(matchTypeLabel("future_type")).toBe("future_type");
  });

  it("labels how a rule was made", () => {
    expect(ruleSourceLabel("user_correction")).toBe("Learned from your correction");
    expect(ruleSourceLabel("manual")).toBe("Added by hand");
    expect(ruleSourceLabel("import")).toBe("import");
  });

  it("groups in the server's type order, drops empty groups, and keeps unknown types last", () => {
    const groups = groupRulesByMatchType([rule("a", "keyword"), rule("b", "vendor"), rule("c", "mystery"), rule("d", "vendor")]);
    expect(groups.map((g) => [g.matchType, g.rules.map((r) => r.id)])).toEqual([
      ["vendor", ["b", "d"]],
      ["keyword", ["a"]],
      ["mystery", ["c"]],
    ]);
  });

  it("returns no groups for no rules", () => {
    expect(groupRulesByMatchType([])).toEqual([]);
  });

  it("filters to one type, or returns everything for null", () => {
    const all = [rule("a", "vendor"), rule("b", "sender")];
    expect(filterRulesByMatchType(all, "sender").map((r) => r.id)).toEqual(["b"]);
    expect(filterRulesByMatchType(all, null)).toHaveLength(2);
  });
});
