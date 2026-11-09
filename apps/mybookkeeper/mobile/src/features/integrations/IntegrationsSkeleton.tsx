import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES, INTEGRATIONS_SKELETON_ROWS } from "../../constants/integrations";

/** Mirrors the loaded screen: the Gmail card, then the sync history rows. */
export default function IntegrationsSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={MESSAGES.loading} accessibilityRole="progressbar" style={{ gap: spacing.md, padding: spacing.lg }} testID="integrations-skeleton">
      <Skeleton height={24} width="30%" />
      <Skeleton height={16} width="60%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
      {INTEGRATIONS_SKELETON_ROWS.map((row) => (
        <Skeleton height={56} key={row} />
      ))}
    </View>
  );
}
