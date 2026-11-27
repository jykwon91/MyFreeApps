import { TRANSACTION_SCOPE_LABELS } from "@mybookkeeper/api-client/constants/transactionScopes";
import type { ClassificationRule } from "@mybookkeeper/api-client/types/classification-rule/classification-rule";
import { PAYEE_RULE_MESSAGES as MSG } from "@/shared/lib/payee-rule-messages";

/** What a rule files besides its category, in words: its scope, then its property or the properties it splits across. */
export function ruleFilingFacts(rule: ClassificationRule, propertyMap: ReadonlyMap<string, string>): string[] {
  const facts: string[] = [];
  if (rule.transaction_scope !== null) facts.push(TRANSACTION_SCOPE_LABELS[rule.transaction_scope]);
  const nameOf = (id: string) => propertyMap.get(id) ?? MSG.unknownProperty;
  if (rule.split_property_ids.length > 1) facts.push(MSG.splitEvenly(rule.split_property_ids.map(nameOf)));
  else if (rule.property_id !== null) facts.push(nameOf(rule.property_id));
  return facts;
}
