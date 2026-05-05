import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { formatRelativeTime } from "@/shared/lib/inquiry-date-format";
import { formatHourlyRate } from "@/shared/utils/hourly-rate";
import type { VendorSummary } from "@/shared/types/vendor/vendor-summary";
import VendorCategoryBadge from "./VendorCategoryBadge";

export interface VendorCardProps {
  vendor: VendorSummary;
  /**
   * When true (i.e. the list is in the "All" filter), render the category
   * badge alongside the vendor name. When false, the category badge is
   * redundant — it's implied by the active chip.
   */
  showCategoryBadge: boolean;
}

function formatLastUsed(lastUsedAt: string | null): string {
  return lastUsedAt === null ? "Never used" : formatRelativeTime(lastUsedAt);
}

/**
 * Mobile vendor card for the rolodex. Whole card is tappable per
 * RENTALS_PLAN.md §9.2 (touch target ≥ 44px).
 *
 * Visible data points (rolodex-card subset):
 *   - vendor name (primary identifier)
 *   - preferred star (host-curated "show first" flag)
 *   - category badge (when not category-filtered)
 *   - hourly rate (quick comparison)
 *   - last used relative time
 *
 * Excluded — detail page only:
 *   - phone, email, address (contact info)
 *   - flat_rate_notes, notes (free-form host notes)
 */
export default function VendorCard({ vendor, showCategoryBadge }: VendorCardProps) {
  return (
    <Link
      to={`/vendors/${vendor.id}`}
      data-testid={`vendor-card-${vendor.id}`}
      className="block border rounded-lg p-4 min-h-[44px] hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-medium leading-tight truncate inline-flex items-center gap-2">
          {vendor.preferred ? (
            <Star
              className="h-4 w-4 fill-yellow-500 text-yellow-500 shrink-0"
              data-testid={`vendor-preferred-star-${vendor.id}`}
              aria-label="Preferred vendor"
            />
          ) : null}
          <span className="truncate">{vendor.name}</span>
        </p>
        {showCategoryBadge ? (
          <VendorCategoryBadge category={vendor.category} />
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">{formatHourlyRate(vendor.hourly_rate)}</span>
        <span className="shrink-0 ml-2">{formatLastUsed(vendor.last_used_at)}</span>
      </div>
    </Link>
  );
}
