import { useState } from "react";
import { Button } from "@platform/ui";
import AlertBox from "@/shared/components/ui/AlertBox";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AddMortgageDialog from "@/app/features/mortgages/AddMortgageDialog";
import EditMortgageDialog from "@/app/features/mortgages/EditMortgageDialog";
import MortgageRateWatchSection from "@/app/features/mortgages/MortgageRateWatchSection";
import MortgagesListBody from "@/app/features/mortgages/MortgagesListBody";
import { useMortgagesListMode } from "@/app/features/mortgages/useMortgagesListMode";
import { useGetMortgagesQuery } from "@/shared/store/mortgagesApi";
import type { Mortgage } from "@/shared/types/mortgage/mortgage";

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

  const { data, isLoading, isError, refetch, isFetching } = useGetMortgagesQuery();

  const mortgages = data?.items ?? [];
  const mode = useMortgagesListMode({
    isLoading,
    mortgageCount: mortgages.length,
  });

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
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

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>Couldn&apos;t load mortgages.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm font-medium hover:underline"
          >
            {isFetching ? "Retrying..." : "Retry"}
          </button>
        </AlertBox>
      ) : null}

      <MortgagesListBody
        mode={mode}
        mortgages={mortgages}
        onEdit={setEditing}
      />

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
    </main>
  );
}
