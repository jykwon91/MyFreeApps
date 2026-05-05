import type { ClassificationRulesPanelMode } from "@/shared/types/transaction/classification-rules-panel-mode";
import type { ClassificationRule } from "@/shared/types/classification-rule/classification-rule";
import ClassificationRulesLoadingState from "./ClassificationRulesLoadingState";
import ClassificationRulesEmptyState from "./ClassificationRulesEmptyState";
import ClassificationRulesList from "./ClassificationRulesList";

export interface ClassificationRulesPanelBodyProps {
  mode: ClassificationRulesPanelMode;
  rules: readonly ClassificationRule[];
  propertyMap: ReadonlyMap<string, string>;
  deletingId: string | null;
  onDeleteClick: (ruleId: string) => void;
}

export default function ClassificationRulesPanelBody({
  mode,
  rules,
  propertyMap,
  deletingId,
  onDeleteClick,
}: ClassificationRulesPanelBodyProps) {
  switch (mode) {
    case "loading":
      return <ClassificationRulesLoadingState />;
    case "empty":
      return <ClassificationRulesEmptyState />;
    case "list":
      return (
        <ClassificationRulesList
          rules={rules}
          propertyMap={propertyMap}
          deletingId={deletingId}
          onDeleteClick={onDeleteClick}
        />
      );
  }
}
