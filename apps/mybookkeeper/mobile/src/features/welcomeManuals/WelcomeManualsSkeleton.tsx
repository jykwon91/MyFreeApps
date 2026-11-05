import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { WELCOME_MANUAL_MESSAGES, WELCOME_MANUAL_SKELETON_ROWS } from "../../constants/welcomeManuals";

export default function WelcomeManualsSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={WELCOME_MANUAL_MESSAGES.loadingList} accessibilityRole="progressbar" testID="welcome-manuals-skeleton">
      {WELCOME_MANUAL_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="65%" />
          <Skeleton height={14} width="40%" />
          <Skeleton height={14} width="55%" />
        </View>
      ))}
    </View>
  );
}
