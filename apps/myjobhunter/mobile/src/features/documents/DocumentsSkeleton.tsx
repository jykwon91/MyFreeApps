import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DOCUMENT_SKELETON_CARDS, DOCUMENTS_SCREEN_MESSAGES as MESSAGES, SUBTITLE_LINE_HEIGHT } from "../../constants/documentsScreen";
import type { DocumentsSkeletonProps } from "../../types/DocumentsSkeletonProps";
import DocumentSkeletonCard from "./DocumentSkeletonCard";

/** The list header's subtitle and its Upload, Write and Type buttons, then the cards with their application links, so nothing moves when the list arrives. */
export default function DocumentsSkeleton({ withHeader }: DocumentsSkeletonProps) {
  const { spacing, radius } = useTheme();
  return (
    <View accessible accessibilityLabel={MESSAGES.loadingList} accessibilityRole="progressbar" style={{ gap: spacing.md }} testID="documents-skeleton">
      {withHeader ? (
        <View style={{ gap: spacing.md, paddingBottom: spacing.md }} testID="documents-header-skeleton">
          <Skeleton height={SUBTITLE_LINE_HEIGHT} width="80%" />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
            </View>
            <View style={{ flex: 1 }}>
              <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
            </View>
          </View>
          <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
        </View>
      ) : null}
      {DOCUMENT_SKELETON_CARDS.map((card) => (
        <DocumentSkeletonCard key={card} withApplicationLink />
      ))}
    </View>
  );
}
