import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

/** A session's shape while it loads: the title row, the Review and Draft switch, and the suggestion card. */
export default function ResumeSessionSkeleton() {
  const { colors, spacing, radius } = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: spacing.lg }} testID="resume-session-skeleton">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton height={20} width="50%" />
        <Skeleton height={14} width="30%" />
      </View>
      <Skeleton borderRadius={radius.md} height={44} />
      <View style={{ gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
        <Skeleton height={16} width="40%" />
        <Skeleton height={6} />
        <Skeleton height={14} width="80%" />
        <Skeleton borderRadius={radius.md} height={72} />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Skeleton borderRadius={radius.md} height={44} style={{ flex: 1 }} />
          <Skeleton borderRadius={radius.md} height={44} style={{ flex: 1 }} />
          <Skeleton borderRadius={radius.md} height={44} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}
