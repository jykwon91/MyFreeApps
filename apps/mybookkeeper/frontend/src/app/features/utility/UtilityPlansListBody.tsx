import type { UtilityPlanSummary } from "@/shared/types/utility/utility-plan-summary";
import type { UtilityPlansListMode } from "@/shared/types/utility/utility-plans-list-mode";
import UtilityPlanRow from "./UtilityPlanRow";

export interface UtilityPlansListBodyProps {
  mode: UtilityPlansListMode;
  plans: UtilityPlanSummary[];
  showExpiringOnly: boolean;
  deletingPlanId: string | null;
  onEdit: (plan: UtilityPlanSummary) => void;
  onDelete: (plan: UtilityPlanSummary) => void;
}

export default function UtilityPlansListBody({
  mode,
  plans,
  showExpiringOnly,
  deletingPlanId,
  onEdit,
  onDelete,
}: UtilityPlansListBodyProps) {
  switch (mode) {
    case "loading":
      return (
        // Mirrors the loaded row: two-line left block, then a badge and the
        // edit/delete actions on the right, so nothing shifts when the data
        // lands. Only the badge placeholder is a pill — the action slots are
        // square, matching the icon buttons they stand in for.
        <div
          className="space-y-2 animate-pulse"
          aria-busy="true"
          data-testid="utility-plans-loading"
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-2/5" />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-5 w-20 bg-muted rounded-full" />
                  <div className="h-6 w-6 bg-muted rounded" />
                  <div className="h-6 w-6 bg-muted rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    case "empty":
      return (
        <p className="text-sm text-muted-foreground" data-testid="utility-plans-empty">
          {showExpiringOnly
            ? "No plans are expiring soon — nothing needs renewing right now."
            : "No utility plans yet — add one to get warned before a fixed rate lapses."}
        </p>
      );
    case "list":
      return (
        <ul className="space-y-2" data-testid="utility-plans-list">
          {plans.map((plan) => (
            <UtilityPlanRow
              key={plan.id}
              plan={plan}
              isDeleting={deletingPlanId === plan.id}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      );
  }
}
