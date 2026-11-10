import { Trash2 } from "lucide-react";
import { matchTypeLabel } from "@mybookkeeper/api-client/utils/classificationRules";
import { formatTag } from "@/shared/utils/tag";
import type { ClassificationRule } from "@mybookkeeper/api-client/types/classification-rule/classification-rule";

export interface ClassificationRulesListProps {
  rules: readonly ClassificationRule[];
  propertyMap: ReadonlyMap<string, string>;
  deletingId: string | null;
  canDelete: boolean;
  onDeleteClick: (ruleId: string) => void;
}

export default function ClassificationRulesList({
  rules,
  propertyMap,
  deletingId,
  canDelete,
  onDeleteClick,
}: ClassificationRulesListProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="px-5 py-2.5 font-medium">Pattern</th>
          <th className="px-3 py-2.5 font-medium">Category</th>
          <th className="px-3 py-2.5 font-medium text-right">Used</th>
          {canDelete ? <th className="px-3 py-2.5 w-14" /> : null}
        </tr>
      </thead>
      <tbody>
        {rules.map((rule) => (
          <tr key={rule.id} className="border-b last:border-0 hover:bg-muted/50">
            <td className="px-5 py-2.5">
              <div className="font-medium">{rule.match_pattern}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex gap-2">
                <span>{matchTypeLabel(rule.match_type)}</span>
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
            {canDelete ? (
            <td className="px-3 py-2.5">
              <button
                onClick={() => onDeleteClick(rule.id)}
                disabled={deletingId === rule.id}
                className="inline-flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-destructive rounded disabled:opacity-50"
                aria-label={`Delete rule for ${rule.match_pattern}`}
              >
                <Trash2 size={14} />
              </button>
            </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
