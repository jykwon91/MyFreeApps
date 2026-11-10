import type { TransactionPreview } from "@mybookkeeper/api-client/types/transaction/TransactionPreview";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { previewAmount, previewDetails, previewName } from "./bankImportDisplay";

interface BankImportPreviewRowProps {
  row: TransactionPreview;
}

export default function BankImportPreviewRow({ row }: BankImportPreviewRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View
      accessible
      style={{ minHeight: MIN_TOUCH_TARGET, gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {previewName(row)}
        </Text>
        <Text style={{ fontSize: fontSize.md, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground }}>{previewAmount(row)}</Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {previewDetails(row)}
      </Text>
    </View>
  );
}
