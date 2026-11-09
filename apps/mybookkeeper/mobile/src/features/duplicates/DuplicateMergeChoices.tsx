import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { DuplicateTransaction } from "@mybookkeeper/api-client/types/transaction/DuplicateTransaction";
import type { MergeableField } from "@mybookkeeper/api-client/types/transaction/MergeableField";
import type { MergeFieldSide } from "@mybookkeeper/api-client/types/transaction/MergeFieldSide";
import { FIELD_LABELS } from "@mybookkeeper/api-client/constants/mergeableTransactionFields";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";
import type { MergeChoices } from "../../types/MergeChoices";
import { duplicateFieldValue, duplicateMergeMode, mergedTagCount } from "./duplicateDisplay";
import DuplicateFieldChoice from "./DuplicateFieldChoice";

/** What to keep for each field the two disagree on, and what the merged record will then say. */
export default function DuplicateMergeChoices({
  txnA,
  txnB,
  differing,
  properties,
  choices,
  onChoose,
  disabled,
}: {
  txnA: DuplicateTransaction;
  txnB: DuplicateTransaction;
  differing: readonly MergeableField[];
  properties: readonly Property[];
  choices: MergeChoices;
  onChoose: (field: MergeableField, side: MergeFieldSide) => void;
  disabled: boolean;
}) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const mode = duplicateMergeMode(differing);
  const tags = mergedTagCount(txnA, txnB);
  return (
    <View style={{ gap: spacing.md }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
        {MESSAGES.merge}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {mode === "no-conflicts" ? MESSAGES.noConflicts : mode === "date-only" ? MESSAGES.dateOnly : MESSAGES.pickBest}
      </Text>
      {differing.map((field) => (
        <DuplicateFieldChoice
          disabled={disabled}
          field={field}
          key={field}
          onSelect={(side) => onChoose(field, side)}
          selected={choices[field]}
          txnA={txnA}
          txnB={txnB}
          valueA={duplicateFieldValue(field, txnA, properties)}
          valueB={duplicateFieldValue(field, txnB, properties)}
        />
      ))}
      {tags > 0 ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`Tags: union of both sides (${tags} total)`}</Text> : null}
      {differing.length > 0 ? (
        <View accessible style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.muted }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}>{MESSAGES.previewTitle}</Text>
          {differing.map((field) => (
            <View key={field} style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{FIELD_LABELS[field]}</Text>
              <Text style={{ flex: 1, textAlign: "right", fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
                {duplicateFieldValue(field, choices[field] === "a" ? txnA : txnB, properties) ?? "—"}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
