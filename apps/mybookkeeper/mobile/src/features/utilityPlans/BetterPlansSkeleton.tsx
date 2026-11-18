import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { UTILITY_OFFER_MESSAGES as MESSAGES } from "../../constants/utilityOffers";

/** Mirrors a loaded property: its name, the plan it holds, then candidate cards. */
export default function BetterPlansSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={MESSAGES.loading} style={{ gap: spacing.md }} testID="better-plans-skeleton">
      <Skeleton height={24} width="55%" />
      <Skeleton height={110} />
      <Skeleton height={190} />
      <Skeleton height={190} />
    </LoadingRegion>
  );
}
