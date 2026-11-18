import { SECURITY_MESSAGES as MESSAGES } from "../constants/security";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import LoadingRegion from "./LoadingRegion";
import Skeleton from "./Skeleton";

/** The name field and its Save button while the account loads. */
export default function DisplayNameSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <LoadingRegion label={MESSAGES.loadingDisplayName} style={{ gap: spacing.sm }} testID="display-name-skeleton">
      <Skeleton height={12} width="25%" />
      <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
      <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
    </LoadingRegion>
  );
}
