import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";

export default function InquiryReplySkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label="Loading this inquiry" style={{ gap: spacing.md, padding: spacing.lg }}>
      <Skeleton height={20} width="60%" />
      <Skeleton height={48} />
      <Skeleton height={160} />
    </LoadingRegion>
  );
}
