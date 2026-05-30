import { useNavigate } from "react-router-dom";
import Badge from "@/shared/components/ui/Badge";
import { formatSectionCount, formatUpdatedAt } from "@/shared/lib/welcome-manual-format";
import type { WelcomeManualSummary } from "@/shared/types/welcome-manual/welcome-manual-summary";

export interface WelcomeManualTableRowProps {
  manual: WelcomeManualSummary;
  propertyName: string | null;
}

/**
 * Desktop table row for a welcome manual. The whole row is clickable
 * (programmatic navigation) and keyboard-accessible via tabIndex + key
 * handling, mirroring ListingTableRow.
 */
export default function WelcomeManualTableRow({ manual, propertyName }: WelcomeManualTableRowProps) {
  const navigate = useNavigate();
  const goToDetail = () => navigate(`/welcome-manuals/${manual.id}`);
  const isEmpty = manual.section_count === 0;

  return (
    <tr
      role="link"
      tabIndex={0}
      data-testid={`welcome-manual-row-${manual.id}`}
      onClick={goToDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDetail();
        }
      }}
      className="border-t cursor-pointer hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <td className="px-4 py-3 font-medium">{manual.title}</td>
      <td className="px-4 py-3 text-muted-foreground">{propertyName ?? "No property tagged"}</td>
      <td className="px-4 py-3">
        <Badge color={isEmpty ? "gray" : "blue"} label={formatSectionCount(manual.section_count)} />
      </td>
      <td className="px-4 py-3 text-right text-muted-foreground">
        {formatUpdatedAt(manual.updated_at)}
      </td>
    </tr>
  );
}
