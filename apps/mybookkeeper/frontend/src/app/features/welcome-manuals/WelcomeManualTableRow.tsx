import { RowPrimaryAction } from "@platform/ui";
import { useNavigate } from "react-router-dom";
import Badge from "@/shared/components/ui/Badge";
import { formatSectionCount, formatUpdatedAt } from "@mybookkeeper/api-client/utils/welcomeManualFormat";
import type { WelcomeManualSummary } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-summary";

export interface WelcomeManualTableRowProps {
  manual: WelcomeManualSummary;
  propertyName: string | null;
}

/**
 * Desktop table row for a welcome manual. A click anywhere on the row opens
 * the manual; its title is the link keyboard and screen-reader users reach,
 * mirroring ListingTableRow.
 */
export default function WelcomeManualTableRow({ manual, propertyName }: WelcomeManualTableRowProps) {
  const navigate = useNavigate();
  const detailPath = `/welcome-manuals/${manual.id}`;
  const isEmpty = manual.section_count === 0;

  return (
    <tr
      onClick={() => navigate(detailPath)}
      data-testid={`welcome-manual-row-${manual.id}`}
      className="border-t cursor-pointer hover:bg-muted/40"
    >
      <td className="px-4 py-3 font-medium">
        <RowPrimaryAction to={detailPath}>{manual.title}</RowPrimaryAction>
      </td>
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
