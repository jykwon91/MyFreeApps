import type { CompanyPillVariant } from "@/types/company/company-pill-variant";

interface Props {
  variant: CompanyPillVariant;
}

export default function CompanyPillBadge({ variant }: Props) {
  if (variant === "tracked") {
    return <span className="text-green-700 dark:text-green-400">tracked</span>;
  }
  if (variant === "new") {
    return <span>new — added when you save</span>;
  }
  return <span className="text-amber-700 dark:text-amber-400">needs attention</span>;
}
