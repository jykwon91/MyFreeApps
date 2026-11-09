import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { DuplicateTransaction } from "@mybookkeeper/api-client/types/transaction/DuplicateTransaction";
import type { MergeableField } from "@mybookkeeper/api-client/types/transaction/MergeableField";
import type { MergeFieldSide } from "@mybookkeeper/api-client/types/transaction/MergeFieldSide";
import { MERGEABLE_FIELDS, FIELD_LABELS } from "@mybookkeeper/api-client/constants/mergeableTransactionFields";
import { LoadingButton, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";
import { duplicateFieldValue, duplicateSideLabel, duplicateSourceCount, duplicateStatusLabel } from "./duplicateDisplay";
import DuplicateChip from "./DuplicateChip";

/** One of the two records, in full. What differs from the other is marked, so it can't be missed. */
export default function DuplicateCandidate({
  side,
  txn,
  properties,
  differing,
  onKeep,
  keepLoading,
  disabled,
}: {
  side: MergeFieldSide;
  txn: DuplicateTransaction;
  properties: readonly Property[];
  differing: ReadonlySet<MergeableField>;
  /** Left out for someone who can't change anything. */
  onKeep?: () => Promise<void>;
  keepLoading: boolean;
  disabled: boolean;
}) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const sources = duplicateSourceCount(txn);
  const fields = MERGEABLE_FIELDS.filter((field) => duplicateFieldValue(field, txn, properties) !== null || differing.has(field));
  return (
    <View style={{ gap: spacing.sm, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {duplicateSideLabel(side, txn)}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        <DuplicateChip label={duplicateStatusLabel(txn.status)} />
        {txn.is_manual ? <DuplicateChip label="Manual" /> : null}
        {sources > 1 ? <DuplicateChip label={`${sources} sources`} /> : null}
      </View>
      {fields.map((field) => {
        const value = duplicateFieldValue(field, txn, properties);
        const differs = differing.has(field);
        return (
          <View
            accessible
            accessibilityLabel={`${FIELD_LABELS[field]}: ${value ?? "none"}${differs ? `, ${MESSAGES.differs.toLowerCase()} from the other` : ""}`}
            key={field}
            style={{
              flexDirection: "row",
              gap: spacing.md,
              padding: spacing.sm,
              borderRadius: radius.md,
              backgroundColor: differs ? colors.muted : "transparent",
              borderLeftWidth: 3,
              borderLeftColor: differs ? colors.primary : "transparent",
            }}
          >
            <Text style={{ width: 96, fontSize: fontSize.sm, color: colors.mutedForeground }}>{FIELD_LABELS[field]}</Text>
            <Text style={{ flex: 1, fontSize: fontSize.md, fontWeight: differs ? "600" : "400", color: colors.foreground }}>{value ?? "—"}</Text>
            {differs ? <Text style={{ fontSize: fontSize.xs, color: colors.primary }}>{MESSAGES.differs}</Text> : null}
          </View>
        );
      })}
      {txn.source_file_name ? (
        txn.source_document_id ? (
          <Pressable
            accessibilityLabel={`${MESSAGES.viewSource}: ${txn.source_file_name}`}
            accessibilityRole="link"
            onPress={() => router.push(`/documents/${txn.source_document_id}`)}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
          >
            <Text numberOfLines={1} style={{ fontSize: fontSize.md, color: colors.primary }}>{txn.source_file_name}</Text>
          </Pressable>
        ) : (
          <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{txn.source_file_name}</Text>
        )
      ) : (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.noSourceDocument}</Text>
      )}
      {onKeep ? (
        <LoadingButton
          accessibilityLabel={`Keep only record ${side.toUpperCase()} and delete the other`}
          disabled={disabled}
          isLoading={keepLoading}
          loadingText={MESSAGES.keeping}
          onPress={onKeep}
          variant="secondary"
        >
          {MESSAGES.keepOnly}
        </LoadingButton>
      ) : null}
    </View>
  );
}
