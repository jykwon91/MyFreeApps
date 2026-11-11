import { CHIP_HEIGHT, MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import type { DocumentSkeletonCardProps } from "../../types/DocumentSkeletonCardProps";

/** The kind chip, title, date, application link and buttons: the same lines as DocumentCard. */
export default function DocumentSkeletonCard({ withApplicationLink }: DocumentSkeletonCardProps) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID="document-skeleton-card"
    >
      <Skeleton borderRadius={radius.md} height={CHIP_HEIGHT} width="30%" />
      <Skeleton height={20} width="60%" />
      <Skeleton height={16} width="40%" />
      {withApplicationLink ? (
        <View style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }} testID="document-skeleton-link">
          <Skeleton height={16} width="25%" />
        </View>
      ) : null}
      <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
    </View>
  );
}
