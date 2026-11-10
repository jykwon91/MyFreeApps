import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { APPLICATION_DETAIL_MESSAGES as MESSAGES } from "../../constants/applicationDetail";
import {
  HEADER_SKELETON_CHIPS,
  LIST_SKELETON_SECTIONS,
  OVERVIEW_SKELETON_FACTS,
  SECTION_SKELETON_CARDS,
} from "../../constants/applicationDetailSkeleton";

/** The application screen's shape while it loads: header, actions, overview, notes, then the lists. */
export default function ApplicationDetailSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={MESSAGES.loading}
      accessibilityRole="progressbar"
      style={{ gap: spacing.xl, padding: spacing.lg }}
      testID="application-detail-skeleton"
    >
      <View style={{ gap: spacing.xs }}>
        <Skeleton height={28} width="70%" />
        <Skeleton height={20} width="40%" />
        <View style={{ flexDirection: "row", gap: spacing.sm, paddingTop: spacing.xs }}>
          {HEADER_SKELETON_CHIPS.map((chip) => (
            <Skeleton borderRadius={radius.full} height={28} key={chip} width={88} />
          ))}
        </View>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET + 24} />
        <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
        <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
      </View>
      <View style={{ gap: spacing.md }}>
        <Skeleton height={22} width="35%" />
        {OVERVIEW_SKELETON_FACTS.map((fact) => (
          <View key={fact} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Skeleton height={16} width="30%" />
            <Skeleton height={16} width="40%" />
          </View>
        ))}
      </View>
      <View style={{ gap: spacing.md }}>
        <Skeleton height={22} width="25%" />
        <Skeleton borderRadius={radius.md} height={120} />
        <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
      </View>
      {LIST_SKELETON_SECTIONS.map(({ key, buttons }) => (
        <View key={key} style={{ gap: spacing.md }} testID={`skeleton-section-${key}`}>
          <Skeleton height={22} width="35%" />
          {buttons.map((button) => (
            <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} key={button} testID="skeleton-section-button" />
          ))}
          {SECTION_SKELETON_CARDS.map((card) => (
            <Skeleton borderRadius={radius.md} height={88} key={card} />
          ))}
        </View>
      ))}
    </View>
  );
}
