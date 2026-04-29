import {
  VENDOR_CATEGORY_BADGE_COLORS,
  VENDOR_CATEGORY_LABELS,
} from "@/shared/lib/vendor-labels";
import type { VendorCategory } from "@/shared/types/vendor/vendor-category";
import type { BadgeColor } from "@/shared/components/ui/Badge";

const COLOR_CLASSES: Record<BadgeColor, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

interface Props {
  category: VendorCategory;
  className?: string;
}

/**
 * Category badge for vendors. Color mapping per ``vendor-labels.ts``.
 *
 * Hidden in category-filtered list views (the active chip already conveys
 * the category) but shown on detail pages and the unfiltered "All" list.
 */
export default function VendorCategoryBadge({ category, className = "" }: Props) {
  const color = VENDOR_CATEGORY_BADGE_COLORS[category];
  return (
    <span
      data-testid={`vendor-category-badge-${category}`}
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${COLOR_CLASSES[color]} ${className}`.trim()}
    >
      {VENDOR_CATEGORY_LABELS[category]}
    </span>
  );
}
