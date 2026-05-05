import { useState } from "react";
import { X } from "lucide-react";
import {
  useListClassificationRulesQuery,
  useDeleteClassificationRuleMutation,
} from "@/shared/store/classificationRulesApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import Panel from "@/shared/components/ui/Panel";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import { useClassificationRulesPanelMode } from "./useClassificationRulesPanelMode";
import ClassificationRulesPanelBody from "./ClassificationRulesPanelBody";

export interface ClassificationRulesPanelProps {
  onClose: () => void;
}

export default function ClassificationRulesPanel({ onClose }: ClassificationRulesPanelProps) {
  const { data: rules = [], isLoading } = useListClassificationRulesQuery();
  const { data: properties = [] } = useGetPropertiesQuery();
  const [deleteRule] = useDeleteClassificationRuleMutation();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const propertyMap = new Map(properties.map((p) => [p.id, p.name]));

  async function handleDelete() {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    setConfirmDeleteId(null);
    try {
      await deleteRule(confirmDeleteId).unwrap();
    } finally {
      setDeletingId(null);
    }
  }

  const deleteTarget = confirmDeleteId ? rules.find((r) => r.id === confirmDeleteId) : null;

  const mode = useClassificationRulesPanelMode({ isLoading, rules });

  return (
    <Panel position="right" onClose={onClose} width="520px">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div>
          <h3 className="font-medium text-base">Classification Rules</h3>
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
        isLoading={deletingId !== null}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </Panel>
  );
}
