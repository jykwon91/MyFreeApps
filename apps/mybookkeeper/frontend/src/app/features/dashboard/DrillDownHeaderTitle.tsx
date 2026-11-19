import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { PanelTitle } from "@platform/ui";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";

export interface DrillDownHeaderTitleProps {
  label: string;
  selectedTxn: Transaction | null;
  /** Under the label on the list: the count and total. */
  headline: ReactNode;
}

/** The figure's label over its headline, or a breadcrumb to the open transaction. */
export default function DrillDownHeaderTitle({ label, selectedTxn, headline }: DrillDownHeaderTitleProps) {
  if (selectedTxn) {
    return (
      <nav className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground truncate">{label}</span>
        <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        <PanelTitle asChild>
          <span className="font-medium truncate">{selectedTxn.vendor ?? "Transaction"}</span>
        </PanelTitle>
      </nav>
    );
  }
  return (
    <>
      <PanelTitle asChild>
        <p className="font-medium">{label}</p>
      </PanelTitle>
      {headline}
    </>
  );
}
