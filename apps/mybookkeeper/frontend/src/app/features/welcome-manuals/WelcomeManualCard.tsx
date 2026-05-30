import { Link } from "react-router-dom";
import Badge from "@/shared/components/ui/Badge";
import { formatSectionCount, formatUpdatedAt } from "@/shared/lib/welcome-manual-format";
import type { WelcomeManualSummary } from "@/shared/types/welcome-manual/welcome-manual-summary";

export interface WelcomeManualCardProps {
  manual: WelcomeManualSummary;
  propertyName: string | null;
}

/**
 * Mobile welcome-manual card. Whole card is tappable; touch target ≥ 44px.
 * Visible data points (per the page spec's information hierarchy):
 *   - title (primary identifier)
 *   - property name (which property this guide is for)
 *   - section count (completeness signal; "0 sections" shown distinctly)
 *   - updated_at (recency)
 */
export default function WelcomeManualCard({ manual, propertyName }: WelcomeManualCardProps) {
  const isEmpty = manual.section_count === 0;

  return (
    <Link
      to={`/welcome-manuals/${manual.id}`}
      data-testid={`welcome-manual-card-${manual.id}`}
      className="block border rounded-lg p-4 min-h-[44px] hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-medium leading-tight">{manual.title}</p>
        <Badge color={isEmpty ? "gray" : "blue"} label={formatSectionCount(manual.section_count)} />
      </div>
      <p className="text-xs text-muted-foreground truncate">
        {propertyName ?? "No property tagged"}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Updated {formatUpdatedAt(manual.updated_at)}
      </p>
    </Link>
  );
}
