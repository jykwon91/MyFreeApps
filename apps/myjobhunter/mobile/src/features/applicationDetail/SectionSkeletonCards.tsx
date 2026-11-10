import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { SECTION_SKELETON_CARDS } from "../../constants/applicationDetailSkeleton";
import type { SectionSkeletonCardsProps } from "../../types/SectionSkeletonCardsProps";

/** Placeholder cards the height of a loaded card, while a section's list loads. */
export default function SectionSkeletonCards({ label, testID }: SectionSkeletonCardsProps) {
  const { spacing, radius } = useTheme();
  return (
    <View accessible accessibilityLabel={label} accessibilityRole="progressbar" style={{ gap: spacing.sm }} testID={testID}>
      {SECTION_SKELETON_CARDS.map((card) => (
        <Skeleton borderRadius={radius.md} height={88} key={card} />
      ))}
    </View>
  );
}
