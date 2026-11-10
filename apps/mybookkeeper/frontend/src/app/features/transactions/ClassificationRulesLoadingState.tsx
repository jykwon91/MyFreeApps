import Skeleton from "@/shared/components/ui/Skeleton";
import { CLASSIFICATION_RULES_SKELETON_ROW_COUNT } from "@/shared/lib/classification-rule-messages";

export interface ClassificationRulesLoadingStateProps {
  canDelete: boolean;
}

const ROWS = Array.from({ length: CLASSIFICATION_RULES_SKELETON_ROW_COUNT }, (_, i) => i);

/** Mirrors ClassificationRulesList: same columns, the delete column only when the list shows it. */
export default function ClassificationRulesLoadingState({ canDelete }: ClassificationRulesLoadingStateProps) {
  return (
    <table className="w-full text-sm" data-testid="classification-rules-skeleton" aria-busy="true">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="px-5 py-2.5 font-medium">Pattern</th>
          <th className="px-3 py-2.5 font-medium">Category</th>
          <th className="px-3 py-2.5 font-medium text-right">Used</th>
          {canDelete ? <th className="px-3 py-2.5 w-14" /> : null}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((i) => (
          <tr key={i} className="border-b last:border-0">
            <td className="px-5 py-2.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-20 mt-1.5" />
            </td>
            <td className="px-3 py-2.5">
              <Skeleton className="h-5 w-20" />
            </td>
            <td className="px-3 py-2.5 text-right">
              <Skeleton className="h-4 w-6 ml-auto" />
            </td>
            {canDelete ? (
              <td className="px-3 py-2.5">
                <Skeleton className="h-11 w-11" />
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
