import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { SECTION_SKELETON_CARDS } from "../../constants/applicationDetailSkeleton";
import type { SectionSkeletonCardsProps } from "../../types/SectionSkeletonCardsProps";

/** Placeholder cards the height of a loaded card, while a section's list loads. */
export default function SectionSkeletonCards({ label, testID }: SectionSkeletonCardsProps) {
  const { spacing, radius } = useTheme();
  return (
    <LoadingRegion label={label} style={{ gap: spacing.sm }} testID={testID}>
      {SECTION_SKELETON_CARDS.map((card) => (
        <Skeleton borderRadius={radius.md} height={88} key={card} />
      ))}
    </LoadingRegion>
  );
}
