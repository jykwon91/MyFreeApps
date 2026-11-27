import { matchTypeLabel } from "@mybookkeeper/api-client/utils/classificationRules";
import type { ClassificationRule } from "@mybookkeeper/api-client/types/classification-rule/classification-rule";
import { VENDOR_RULE_FILTER_MESSAGES, VENDOR_RULE_MESSAGES } from "../../constants/vendorRules";
import type { VendorRulePropertyState } from "../../types/VendorRulePropertyState";
import { categoryLabel } from "../transactions/transactionDisplay";

/** "Used 3 times" / "Never used", so a glance says whether the rule is pulling its weight. */
export function timesUsedText(timesApplied: number): string {
  if (timesApplied === 0) return "Never used";
  return `Used ${timesApplied} ${timesApplied === 1 ? "time" : "times"}`;
}

/** The property is left out until its name is known, rather than guessed. */
export function vendorRuleSummary(rule: ClassificationRule, propertyName: string | null): string {
  return [categoryLabel(rule.category), timesUsedText(rule.times_applied), propertyName].filter(Boolean).join(", ");
}

export function vendorRuleRowLabel(rule: ClassificationRule, propertyName: string | null): string {
  return `${rule.match_pattern}, ${vendorRuleSummary(rule, propertyName)}`;
}

/** "Rule type" when nothing is narrowed, otherwise what is, so the button says what the list is showing. */
export function vendorRuleFilterLabel(matchType: string | null): string {
  return matchType === null ? VENDOR_RULE_FILTER_MESSAGES.button : `${VENDOR_RULE_FILTER_MESSAGES.button}: ${matchTypeLabel(matchType)}`;
}

/** The properties a rule files payments under: the ones it splits across, or its one property. */
export function rulePropertyIds(rule: ClassificationRule): string[] {
  if (rule.split_property_ids.length > 1) return rule.split_property_ids;
  return rule.property_id === null ? [] : [rule.property_id];
}

function splitText(rule: ClassificationRule, nameOf: (id: string) => string): string {
  return VENDOR_RULE_MESSAGES.splitEvenly(rule.split_property_ids.map(nameOf));
}

/** The name(s) to show on a row: null while loading, on failure, or when the rule has no property. */
export function listPropertyName(rule: ClassificationRule, names: ReadonlyMap<string, string>): string | null {
  const ids = rulePropertyIds(rule);
  if (ids.length === 0 || ids.some((id) => !names.has(id))) return null;
  if (ids.length === 1) return names.get(ids[0]) ?? null;
  return splitText(rule, (id) => names.get(id) ?? "");
}

/** The words for the property fact, for each state the lookup can be in. */
export function propertyFactText(rule: ClassificationRule, state: VendorRulePropertyState, names: ReadonlyMap<string, string>): string {
  const ids = rulePropertyIds(rule);
  if (ids.length === 0) return VENDOR_RULE_MESSAGES.noProperty;
  if (state === "pending") return VENDOR_RULE_MESSAGES.propertyPending;
  if (state === "failed") return VENDOR_RULE_MESSAGES.propertyLoadFailed;
  const nameOf = (id: string) => names.get(id) ?? VENDOR_RULE_MESSAGES.propertyMissing;
  if (ids.length === 1) return nameOf(ids[0]);
  return splitText(rule, nameOf);
}
