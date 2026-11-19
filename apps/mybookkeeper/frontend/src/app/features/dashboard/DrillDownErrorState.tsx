import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";
import { DRILL_DOWN_LOAD_ERROR } from "@/shared/lib/drill-down-messages";
import type { PagedListStatus } from "@/shared/types/paged-list-status";

export interface DrillDownErrorStateProps {
  pages: PagedListStatus;
}

/** The drill-down's load error with Retry: the whole list, or only "Load more" when rows already show. */
export default function DrillDownErrorState({ pages }: DrillDownErrorStateProps) {
  if (pages.error === undefined) return null;
  return (
    <div className="px-5 pt-3">
      <ListPagesErrorAlert pages={pages} noun="transactions" loadMessage={DRILL_DOWN_LOAD_ERROR} />
    </div>
  );
}
