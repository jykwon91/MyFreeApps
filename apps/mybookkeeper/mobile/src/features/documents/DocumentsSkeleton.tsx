import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DOCUMENT_LIST_MESSAGES } from "../../constants/documents";

const ROWS = ["a", "b", "c", "d", "e", "f"];

export default function DocumentsSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={DOCUMENT_LIST_MESSAGES.loading} style={{ gap: spacing.lg, padding: spacing.lg }} testID="documents-skeleton">
      {ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs }}>
          <Skeleton height={20} />
          <Skeleton height={14} />
        </View>
      ))}
    </LoadingRegion>
  );
}
