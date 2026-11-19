import { CAPITAL_IMPROVEMENT_LABEL } from "@mybookkeeper/api-client/constants/capitalImprovementLabels";

export default function CapitalImprovementBadge() {
  return (
    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {CAPITAL_IMPROVEMENT_LABEL}
    </span>
  );
}
