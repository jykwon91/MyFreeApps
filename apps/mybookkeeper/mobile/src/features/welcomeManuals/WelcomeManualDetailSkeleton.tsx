import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { WELCOME_MANUAL_MESSAGES } from "../../constants/welcomeManuals";

export default function WelcomeManualDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={WELCOME_MANUAL_MESSAGES.loadingOne} style={{ gap: spacing.md, padding: spacing.lg }} testID="welcome-manual-detail-skeleton">
      <Skeleton height={28} width="70%" />
      <Skeleton height={20} width="40%" />
      <Skeleton height={60} />
      <Skeleton height={44} />
      <Skeleton height={100} />
      <Skeleton height={100} />
    </LoadingRegion>
  );
}
