import type { ClassificationRule } from "./classification-rule";

export interface ClassificationRuleGroup {
  matchType: string;
  label: string;
  rules: readonly ClassificationRule[];
}
