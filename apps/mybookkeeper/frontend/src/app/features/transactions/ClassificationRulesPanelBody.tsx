import type { ClassificationRulesPanelMode } from "@/shared/types/transaction/classification-rules-panel-mode";
import type { ClassificationRule } from "@mybookkeeper/api-client/types/classification-rule/classification-rule";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { CLASSIFICATION_RULE_MESSAGES } from "@/shared/lib/classification-rule-messages";
import ClassificationRulesLoadingState from "./ClassificationRulesLoadingState";
import ClassificationRulesEmptyState from "./ClassificationRulesEmptyState";
import ClassificationRulesList from "./ClassificationRulesList";

export interface ClassificationRulesPanelBodyProps {
  mode: ClassificationRulesPanelMode;
  rules: readonly ClassificationRule[];
  propertyMap: ReadonlyMap<string, string>;
  deletingId: string | null;
  canDelete: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onDeleteClick: (ruleId: string) => void;
}

export default function ClassificationRulesPanelBody({
  mode,
  rules,
  propertyMap,
  deletingId,
  canDelete,
  isRetrying,
  onRetry,
  onDeleteClick,
}: ClassificationRulesPanelBodyProps) {
  switch (mode) {
    case "loading":
      return <ClassificationRulesLoadingState canDelete={canDelete} />;
    case "error":
      return (
        <div className="p-5">
          <LoadErrorAlert message={CLASSIFICATION_RULE_MESSAGES.couldntLoad} isRetrying={isRetrying} onRetry={onRetry} />
        </div>
      );
    case "empty":
      return <ClassificationRulesEmptyState />;
    case "list":
      return (
        <ClassificationRulesList
          rules={rules}
          propertyMap={propertyMap}
          deletingId={deletingId}
          canDelete={canDelete}
          onDeleteClick={onDeleteClick}
        />
      );
  }
}
