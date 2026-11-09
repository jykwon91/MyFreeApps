import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DOCUMENT_LIBRARY_SKELETON_ROWS } from "../../constants/documentReader";

/** Rows shaped like the document choices that are on their way. */
export default function DocumentLibrarySkeleton({ label }: { label: string }) {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={label} accessibilityRole="progressbar" testID="document-library-skeleton">
      {DOCUMENT_LIBRARY_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="70%" />
        </View>
      ))}
    </View>
  );
}
