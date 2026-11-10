import {
  CLASSIFICATION_RULE_MATCH_TYPE_LABELS,
  CLASSIFICATION_RULE_MATCH_TYPES,
  CLASSIFICATION_RULE_SOURCE_LABELS,
} from "../constants/classificationRuleLabels";
import type { ClassificationRule } from "../types/classification-rule/classification-rule";
import type { ClassificationRuleGroup } from "../types/classification-rule/classification-rule-group";
import type { ClassificationRuleMatchType } from "../types/classification-rule/classification-rule-match-type";

function isKnownMatchType(value: string): value is ClassificationRuleMatchType {
  return (CLASSIFICATION_RULE_MATCH_TYPES as readonly string[]).includes(value);
}

export function matchTypeLabel(matchType: string): string {
  return isKnownMatchType(matchType) ? CLASSIFICATION_RULE_MATCH_TYPE_LABELS[matchType] : matchType;
}

/** How the rule came to exist, in words; an unrecognised source is shown as the server sent it. */
export function ruleSourceLabel(source: string): string {
  return CLASSIFICATION_RULE_SOURCE_LABELS[source] ?? source;
}

/** Groups rules by match type in the server's order, then any unrecognised types; empty groups are left out. */
export function groupRulesByMatchType(rules: readonly ClassificationRule[]): ClassificationRuleGroup[] {
  const order = [...CLASSIFICATION_RULE_MATCH_TYPES, ...new Set(rules.map((r) => r.match_type).filter((t) => !isKnownMatchType(t)))];
  return order
    .map((matchType) => ({ matchType, label: matchTypeLabel(matchType), rules: rules.filter((r) => r.match_type === matchType) }))
    .filter((group) => group.rules.length > 0);
}

/** The rules of one match type, or all of them when `matchType` is null. */
export function filterRulesByMatchType(rules: readonly ClassificationRule[], matchType: string | null): ClassificationRule[] {
  return matchType === null ? [...rules] : rules.filter((r) => r.match_type === matchType);
}
