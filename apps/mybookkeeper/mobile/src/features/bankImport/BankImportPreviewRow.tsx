import type { TransactionPreview } from "@mybookkeeper/api-client/types/transaction/TransactionPreview";
import { ListRowTitle, MIN_TOUCH_TARGET, useLargeText, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { previewAmount, previewDetails, previewName } from "./bankImportDisplay";

interface BankImportPreviewRowProps {
  row: TransactionPreview;
}

export default function BankImportPreviewRow({ row }: BankImportPreviewRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const isLargeText = useLargeText();
  return (
    <View
      accessible
      style={{ minHeight: MIN_TOUCH_TARGET, gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <ListRowTitle
        aside={<Text style={{ fontSize: fontSize.md, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground }}>{previewAmount(row)}</Text>}
        title={previewName(row)}
      />
      <Text numberOfLines={isLargeText ? undefined : 1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {previewDetails(row)}
      </Text>
    </View>
  );
}
