import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { formatRelativeTime } from "@/shared/lib/inquiry-date-format";
import type { VendorSummary } from "@/shared/types/vendor/vendor-summary";
import VendorCategoryBadge from "./VendorCategoryBadge";

export interface VendorRowProps {
  vendor: VendorSummary;
  showCategoryBadge: boolean;
}

function formatHourlyRate(rate: string | null): string {
  if (rate === null) return "—";
  // Backend returns Decimal as a string — strip trailing zeros for display.
  const num = Number(rate);
  if (Number.isNaN(num)) return "—";
  return `$${num.toFixed(2)}/hr`;
}

function formatLastUsed(lastUsedAt: string | null): string {
  return lastUsedAt === null ? "Never used" : formatRelativeTime(lastUsedAt);
}

/**
 * Desktop table row for the Vendors rolodex. Click anywhere navigates to
 * the detail page.
 */
export default function VendorRow({ vendor, showCategoryBadge }: VendorRowProps) {
  const navigate = useNavigate();

  return (
    <tr
      data-testid={`vendor-row-${vendor.id}`}
      onClick={() => navigate(`/vendors/${vendor.id}`)}
      className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
    >
      <td className="px-4 py-3 font-medium">
        <span className="inline-flex items-center gap-2">
          {vendor.preferred ? (
            <Star
              className="h-4 w-4 fill-yellow-500 text-yellow-500 shrink-0"
              data-testid={`vendor-preferred-star-${vendor.id}`}
              aria-label="Preferred vendor"
            />
          ) : null}
          <span className="truncate">{vendor.name}</span>
        </span>
      </td>
      <td className="px-4 py-3">
        {showCategoryBadge ? (
          <VendorCategoryBadge category={vendor.category} />
        ) : null}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {formatHourlyRate(vendor.hourly_rate)}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {formatLastUsed(vendor.last_used_at)}
      </td>
    </tr>
  );
}
