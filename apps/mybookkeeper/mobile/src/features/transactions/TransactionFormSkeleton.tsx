import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";

/** The shape of the add and edit transaction forms while they wait. */
export default function TransactionFormSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label="Loading this transaction" style={{ gap: spacing.md, padding: spacing.lg }} testID="transaction-edit-skeleton">
      <Skeleton height={48} />
      <Skeleton height={48} />
      <Skeleton height={48} />
    </LoadingRegion>
  );
}
