import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";

export default function SyncSessionSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={MESSAGES.sessionLoading} accessibilityRole="progressbar" style={{ gap: spacing.md, padding: spacing.lg }} testID="sync-session-skeleton">
      <Skeleton height={28} width="70%" />
      <Skeleton height={20} width="50%" />
      <Skeleton height={20} width="60%" />
      <Skeleton height={56} />
      <Skeleton height={56} />
    </View>
  );
}
