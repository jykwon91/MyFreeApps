import { useState } from "react";
import { Button } from "@platform/ui";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AddMortgageDialog from "@/app/features/mortgages/AddMortgageDialog";
import EditMortgageDialog from "@/app/features/mortgages/EditMortgageDialog";
import MortgageRateWatchSection from "@/app/features/mortgages/MortgageRateWatchSection";
import MortgagesListBody from "@/app/features/mortgages/MortgagesListBody";
import { pagedListView } from "@/shared/lib/paged-list-view";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";
import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";
import { useMortgagesPages } from "@mybookkeeper/api-client/hooks/useMortgagesPages";
import type { Mortgage } from "@mybookkeeper/api-client/types/mortgage/mortgage";

/**
 * Every loan on record, then what the market is doing to them.
 *
 * Same shape as the insurance and utility pages: what you hold first, then the
 * market. The rate check sits below the list because it is meaningless without
 * one — and because reading the list is what tells you whether the answer below
 * covers everything you owe on.
 */
export default function Mortgages() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editing, setEditing] = useState<Mortgage | null>(null);

  const pages = useMortgagesPages();
  const { mode, rows: mortgages } = pagedListView(pages, pages.mortgages);

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <SectionHeader
        title="Mortgages"
        subtitle="Track what you owe on each property, and whether a better rate exists."
        actions={
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setShowAddDialog(true)}
            data-testid="add-mortgage-button"
          >
            Add mortgage
          </Button>
        }
      />

      <ListPagesErrorAlert pages={pages} noun="mortgages" loadMessage="Couldn't load mortgages." />

      <MortgagesListBody
        mode={mode}
        mortgages={mortgages}
        onEdit={setEditing}
      />

      {mode === "list" ? (
        <LoadMoreButton hasNextPage={pages.hasNextPage} isFetchingNextPage={pages.isFetchingNextPage} onLoadMore={pages.loadMore} />
      ) : null}

      <MortgageRateWatchSection />

      {showAddDialog ? (
        <AddMortgageDialog onClose={() => setShowAddDialog(false)} />
      ) : null}

      {editing ? (
        <EditMortgageDialog
          mortgage={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
