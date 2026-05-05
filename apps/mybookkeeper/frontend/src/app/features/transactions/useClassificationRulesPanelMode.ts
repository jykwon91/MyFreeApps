import type { ClassificationRulesPanelMode } from "@/shared/types/transaction/classification-rules-panel-mode";
import type { ClassificationRule } from "@/shared/types/classification-rule/classification-rule";

interface UseClassificationRulesPanelModeArgs {
  isLoading: boolean;
  rules: readonly ClassificationRule[];
}

/**
 * Resolves the panel's render mode from the loaded state. Single source of
 * truth so the body component is a flat switch instead of a tower of
 * conditionals.
 */
export function useClassificationRulesPanelMode({
  isLoading,
  rules,
}: UseClassificationRulesPanelModeArgs): ClassificationRulesPanelMode {
  if (isLoading) return "loading";
  if (rules.length === 0) return "empty";
  return "list";
}
