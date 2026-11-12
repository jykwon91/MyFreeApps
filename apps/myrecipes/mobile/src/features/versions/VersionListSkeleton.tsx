import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { VERSION_HISTORY_MESSAGES as MESSAGES, VERSION_SKELETON_ROWS } from "../../constants/versions";

/** The version list's rows while it loads: number, note, and date line. */
export default function VersionListSkeleton() {
  const { colors, spacing, radius, fontSize } = useTheme();

  return (
    <View accessibilityLabel={MESSAGES.loading} accessible style={{ gap: spacing.md }}>
      {Array.from({ length: VERSION_SKELETON_ROWS }, (_, index) => (
        <View
          key={index}
          style={{
            padding: spacing.lg,
            gap: spacing.xs,
            borderWidth: 1,
            borderRadius: radius.md,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
          testID="version-skeleton-row"
        >
          <Skeleton height={fontSize.md} width="20%" />
          <Skeleton height={fontSize.sm} width="75%" />
          <Skeleton height={fontSize.xs} width="45%" />
        </View>
      ))}
    </View>
  );
}
