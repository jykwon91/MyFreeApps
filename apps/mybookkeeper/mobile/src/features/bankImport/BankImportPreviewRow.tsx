import type { TransactionPreview } from "@mybookkeeper/api-client/types/transaction/TransactionPreview";
import { ClampedText, ListRowTitle, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
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
      <ListRowTitle
        aside={<Text style={{ fontSize: fontSize.md, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground }}>{previewAmount(row)}</Text>}
        title={previewName(row)}
      />
      <ClampedText numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {previewDetails(row)}
      </ClampedText>
    </View>
  );
}
