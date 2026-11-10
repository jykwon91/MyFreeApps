import type { ImportResult } from "@mybookkeeper/api-client/types/transaction/ImportResult";
import { formatTag } from "@platform/core/utils/tag";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { BANK_IMPORT_MESSAGES as MESSAGES } from "../../constants/bankImport";
import BankImportPreviewRow from "./BankImportPreviewRow";

interface BankImportResultViewProps {
  result: ImportResult;
  onViewTransactions: () => void;
  onImportAnother: () => void;
}

/** The glance: how many came in, then the way on to review them. The first rows are a taste, not the list. */
export default function BankImportResultView({ result, onViewTransactions, onImportAnother }: BankImportResultViewProps) {
  const { colors, spacing, fontSize } = useTheme();
  const figures: [string, string][] = [
    [MESSAGES.imported, String(result.imported)],
    [MESSAGES.duplicates, String(result.skipped_duplicates)],
    [MESSAGES.format, formatTag(result.format_detected)],
  ];
  return (
    <View style={{ gap: spacing.lg }} testID="bank-import-result">
      <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
        {MESSAGES.resultHeading}
      </Text>
      <View style={{ gap: spacing.xs }}>
        {figures.map(([label, value]) => (
          <View accessible accessibilityLabel={`${label}, ${value}`} key={label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{label}</Text>
            <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{value}</Text>
          </View>
        ))}
      </View>
      {result.imported === 0 ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.nothingNew}</Text> : null}
      {result.preview.length > 0 ? (
        <View>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.previewHeading}
          </Text>
          {result.preview.map((row, index) => (
            <BankImportPreviewRow key={`${row.date}-${index}`} row={row} />
          ))}
        </View>
      ) : null}
      <LoadingButton onPress={onViewTransactions}>{MESSAGES.viewTransactions}</LoadingButton>
      <LoadingButton onPress={onImportAnother} variant="secondary">
        {MESSAGES.importAnother}
      </LoadingButton>
    </View>
  );
}
