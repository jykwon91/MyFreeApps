import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import {
  useListClassificationRulesQuery,
  useDeleteClassificationRuleMutation,
} from "@/shared/store/classificationRulesApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { formatTag } from "@/shared/utils/tag";
import Panel from "@/shared/components/ui/Panel";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import Spinner from "@/shared/components/icons/Spinner";

interface Props {
  onClose: () => void;
}

export default function ClassificationRulesPanel({ onClose }: Props) {
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
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : rules.length === 0 ? (
          <div className="px-5 py-12 text-center text-muted-foreground text-sm">
            <p>No classification rules yet.</p>
            <p className="mt-1">When you correct a transaction's category, I'll remember the vendor and apply it automatically next time.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Pattern</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 font-medium text-right">Used</th>
                <th className="px-3 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-5 py-2.5">
                    <div className="font-medium">{rule.match_pattern}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-2">
                      <span className="capitalize">{rule.match_type}</span>
                      {rule.property_id ? (
                        <span>| {propertyMap.get(rule.property_id) ?? "Unknown property"}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-block bg-muted text-xs px-2 py-0.5 rounded">
                      {formatTag(rule.category)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">
                    {rule.times_applied}x
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => setConfirmDeleteId(rule.id)}
                      disabled={deletingId === rule.id}
                      className="text-muted-foreground hover:text-destructive p-1 rounded disabled:opacity-50"
                      aria-label={`Delete rule for ${rule.match_pattern}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
