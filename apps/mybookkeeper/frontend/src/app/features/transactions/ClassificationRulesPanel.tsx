import { useRef, useState } from "react";
import { X } from "lucide-react";
import {
  useListClassificationRulesQuery,
  useDeleteClassificationRuleMutation,
} from "@mybookkeeper/api-client/store/classificationRulesApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { writeFailure } from "@mybookkeeper/api-client/utils/writeFailure";
import { Panel, PanelTitle, ConfirmDialog, showError, showSuccess } from "@platform/ui";
import { useIsOrgAdmin } from "@/shared/hooks/useOrgRole";
import {
  CLASSIFICATION_RULE_DELETE_FAILURE_MESSAGES,
  CLASSIFICATION_RULE_MESSAGES,
} from "@/shared/lib/classification-rule-messages";
import { useClassificationRulesPanelMode } from "./useClassificationRulesPanelMode";
import ClassificationRulesPanelBody from "./ClassificationRulesPanelBody";

export interface ClassificationRulesPanelProps {
  onClose: () => void;
}

export default function ClassificationRulesPanel({ onClose }: ClassificationRulesPanelProps) {
  const { data: rules = [], isLoading, isError, isFetching, refetch } = useListClassificationRulesQuery();
  const { data: properties = [] } = useGetPropertiesQuery();
  const isDeleting = useRef(false);
  const canDelete = useIsOrgAdmin();
  const [deleteRule] = useDeleteClassificationRuleMutation();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const propertyMap = new Map(properties.map((p) => [p.id, p.name]));

  async function handleDelete() {
    if (!confirmDeleteId || isDeleting.current) return;
    const id = confirmDeleteId;
    isDeleting.current = true;
    setDeletingId(id);
    try {
      await deleteRule(id).unwrap();
      showSuccess(CLASSIFICATION_RULE_MESSAGES.deleted);
      setConfirmDeleteId(null);
    } catch (error) {
      const failure = writeFailure(error);
      if (failure === "gone") {
        showSuccess(CLASSIFICATION_RULE_MESSAGES.alreadyDeleted);
        setConfirmDeleteId(null);
      } else {
        showError(CLASSIFICATION_RULE_DELETE_FAILURE_MESSAGES[failure]);
        if (failure === "viewOnly") setConfirmDeleteId(null);
      }
    } finally {
      isDeleting.current = false;
      setDeletingId(null);
    }
  }

  const deleteTarget = confirmDeleteId ? rules.find((r) => r.id === confirmDeleteId) : null;

  const mode = useClassificationRulesPanelMode({ isLoading, isError, rules });

  return (
    <Panel position="right" onClose={onClose} width="520px">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div>
          <PanelTitle asChild>
            <h3 className="font-medium text-base">Classification Rules</h3>
          </PanelTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            I learn these from your corrections. When you change a category, I remember it for next time.
          </p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded shrink-0 ml-2" aria-label="Close panel">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <ClassificationRulesPanelBody
          mode={mode}
          rules={rules}
          propertyMap={propertyMap}
          deletingId={deletingId}
          canDelete={canDelete}
          isRetrying={isFetching}
          onRetry={() => void refetch()}
          onDeleteClick={setConfirmDeleteId}
        />
      </div>

      <div className="px-5 py-3 border-t text-xs text-muted-foreground">
        {rules.length} rule{rules.length === 1 ? "" : "s"} total
      </div>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete classification rule"
        description={`Remove the rule for "${deleteTarget?.match_pattern ?? ""}"? Future transactions matching this pattern won't be auto-categorized.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={!!deletingId}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!isDeleting.current) setConfirmDeleteId(null);
        }}
      />
    </Panel>
  );
}
