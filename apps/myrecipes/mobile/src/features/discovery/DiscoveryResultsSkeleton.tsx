import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DISCOVERY_CARD_IMAGE_ASPECT, DISCOVERY_SKELETON_CARD_COUNT } from "../../constants/discovery";

/** Mirrors the result cards — picture band, title, source line, summary — so results don't shift the list. */
export default function DiscoveryResultsSkeleton() {
  const { colors, spacing, radius, fontSize } = useTheme();

  return (
    <View accessibilityLabel="Searching the web for recipes" accessible style={{ gap: spacing.md }}>
      {Array.from({ length: DISCOVERY_SKELETON_CARD_COUNT }, (_, index) => (
        <View
          key={index}
          style={{ overflow: "hidden", borderWidth: 1, borderRadius: radius.md, borderColor: colors.border, backgroundColor: colors.card }}
        >
          <View style={{ aspectRatio: DISCOVERY_CARD_IMAGE_ASPECT }}>
            <Skeleton borderRadius={0} height="100%" testID="discovery-skeleton-card" />
          </View>
          <View style={{ padding: spacing.lg, gap: spacing.sm }}>
            <Skeleton height={fontSize.md} width="75%" />
            <Skeleton height={fontSize.xs} width="35%" />
            <Skeleton height={fontSize.sm} />
            <Skeleton height={fontSize.sm} width="65%" />
          </View>
        </View>
      ))}
    </View>
  );
}
