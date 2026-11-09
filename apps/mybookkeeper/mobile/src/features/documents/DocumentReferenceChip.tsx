import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { DOCUMENT_LIST_MESSAGES } from "../../constants/documents";

/** Marks a document that was paid through escrow, so it adds no transactions. */
export default function DocumentReferenceChip() {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md, backgroundColor: colors.muted }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{DOCUMENT_LIST_MESSAGES.reference}</Text>
    </View>
  );
}
