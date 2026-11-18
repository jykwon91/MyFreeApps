import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";

const PEOPLE_ROWS = [0, 1, 2];

export default function MembersSkeleton({ isAdmin, label }: { isAdmin: boolean; label: string }) {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={label} style={{ gap: spacing.md }} testID="members-skeleton">
      {isAdmin ? <Skeleton height={44} /> : null}
      <Skeleton height={20} width={120} />
      {PEOPLE_ROWS.map((row) => (
        <Skeleton height={64} key={row} />
      ))}
      {isAdmin ? (
        <>
          <Skeleton height={20} width={160} />
          <Skeleton height={96} />
        </>
      ) : null}
    </LoadingRegion>
  );
}
