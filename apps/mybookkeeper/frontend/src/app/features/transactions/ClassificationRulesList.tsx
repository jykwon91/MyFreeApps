import { History, Loader2, Trash2 } from "lucide-react";
import { matchTypeLabel } from "@mybookkeeper/api-client/utils/classificationRules";
import { formatTag } from "@/shared/utils/tag";
import { ruleFilingFacts } from "@/shared/utils/rule-filing-facts";
import { PAYEE_RULE_MESSAGES } from "@/shared/lib/payee-rule-messages";
import type { ClassificationRule } from "@mybookkeeper/api-client/types/classification-rule/classification-rule";

const PAYEE_MATCH_TYPE = "vendor";

export interface ClassificationRulesListProps {
  rules: readonly ClassificationRule[];
  propertyMap: ReadonlyMap<string, string>;
  deletingId: string | null;
  /** The rule whose past payments are being counted. */
  checkingRuleId: string | null;
  canDelete: boolean;
  onDeleteClick: (ruleId: string) => void;
  onApplyToPastClick: (rule: ClassificationRule) => void;
}

export default function ClassificationRulesList({
  rules,
  propertyMap,
  deletingId,
  checkingRuleId,
  canDelete,
  onDeleteClick,
  onApplyToPastClick,
}: ClassificationRulesListProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="px-5 py-2.5 font-medium">Pattern</th>
          <th className="px-3 py-2.5 font-medium">Category</th>
          <th className="px-3 py-2.5 font-medium text-right">Used</th>
          {canDelete && <th className="px-3 py-2.5 w-24" />}
        </tr>
      </thead>
      <tbody>
        {rules.map((rule) => (
          <tr key={rule.id} className="border-b last:border-0 hover:bg-muted/50">
            <td className="px-5 py-2.5">
              <div className="font-medium">{rule.match_pattern}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                <span>{matchTypeLabel(rule.match_type)}</span>
                {ruleFilingFacts(rule, propertyMap).map((fact) => (
                  <span key={fact}>| {fact}</span>
                ))}
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
            {canDelete && (
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end">
                  {rule.match_type === PAYEE_MATCH_TYPE && (
                    <button
                      onClick={() => onApplyToPastClick(rule)}
                      disabled={checkingRuleId !== null}
                      className="inline-flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground rounded disabled:opacity-50"
                      aria-label={PAYEE_RULE_MESSAGES.applyToPastLabel(rule.match_pattern)}
                      title={PAYEE_RULE_MESSAGES.applyToPast}
                    >
                      {checkingRuleId === rule.id && <Loader2 size={14} className="animate-spin" />}
                      {checkingRuleId !== rule.id && <History size={14} />}
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteClick(rule.id)}
                    disabled={deletingId === rule.id}
                    className="inline-flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-destructive rounded disabled:opacity-50"
                    aria-label={`Delete rule for ${rule.match_pattern}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
