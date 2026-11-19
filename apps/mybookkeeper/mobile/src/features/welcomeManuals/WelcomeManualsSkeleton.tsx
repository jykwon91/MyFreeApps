import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { WELCOME_MANUAL_MESSAGES, WELCOME_MANUAL_SKELETON_ROWS } from "../../constants/welcomeManuals";

export function WelcomeManualSkeletonRow() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Skeleton height={20} width="65%" />
      <Skeleton height={14} width="40%" />
      <Skeleton height={14} width="55%" />
    </View>
  );
}

export default function WelcomeManualsSkeleton() {
  return (
    <LoadingRegion label={WELCOME_MANUAL_MESSAGES.loadingList} testID="welcome-manuals-skeleton">
      {WELCOME_MANUAL_SKELETON_ROWS.map((row) => (
        <WelcomeManualSkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}
