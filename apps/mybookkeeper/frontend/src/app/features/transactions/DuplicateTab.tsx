import DuplicateCard from "@/app/features/transactions/DuplicateCard";
import DuplicateReviewSkeleton from "@/app/features/transactions/DuplicateReviewSkeleton";
import EmptyState from "@/shared/components/ui/EmptyState";
import type { DuplicatePair } from "@/shared/types/transaction/duplicate";
import type { MergeFieldSide } from "@/shared/types/transaction/duplicate";

interface DuplicateTabProps {
  duplicatePairs: DuplicatePair[];
  isLoading: boolean;
  propertyMap: Map<string, string>;
  onMerge: (
    transactionAId: string,
    transactionBId: string,
    survivingId: string,
    fieldOverrides: Record<string, MergeFieldSide>,
  ) => Promise<void>;
  onDismiss: (ids: string[]) => Promise<void>;
}

export default function DuplicateTab({
  duplicatePairs,
  isLoading,
  propertyMap,
  onMerge,
  onDismiss,
}: DuplicateTabProps) {
  if (isLoading) {
    return <DuplicateReviewSkeleton />;
  }

  if (duplicatePairs.length === 0) {
    return (
      <EmptyState message="No suspected duplicates right now. I scan for transactions with the same amount, property, and similar dates — if anything looks off, it'll show up here." />
    );
  }

  return (
    <>
      {duplicatePairs.map((pair) => (
        <DuplicateCard
          key={pair.id}
          pair={pair}
          propertyMap={propertyMap}
          onMerge={onMerge}
          onDismiss={onDismiss}
        />
      ))}
    </>
  );
}
