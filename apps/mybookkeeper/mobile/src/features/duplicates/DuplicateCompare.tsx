import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { DuplicatePair } from "@mybookkeeper/api-client/types/transaction/DuplicatePair";
import type { MergeableField } from "@mybookkeeper/api-client/types/transaction/MergeableField";
import type { MergeFieldSide } from "@mybookkeeper/api-client/types/transaction/MergeFieldSide";
import { duplicateConfidenceLabel, duplicateHeadline } from "@mybookkeeper/api-client/utils/duplicatePairLabels";
import { computeDefaults, differingFields } from "@mybookkeeper/api-client/utils/mergeDefaults";
import { Banner, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState, type ReactElement } from "react";
import { type RefreshControlProps, ScrollView, Text, View } from "react-native";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import type { MergeChoices } from "../../types/MergeChoices";
import { confirmDuplicateChange } from "./confirmDuplicateChange";
import DuplicateActionBar from "./DuplicateActionBar";
import DuplicateCandidate from "./DuplicateCandidate";
import DuplicateChip from "./DuplicateChip";
import DuplicateMergeChoices from "./DuplicateMergeChoices";
import { useDuplicateActions } from "./useDuplicateActions";

/** The two records stacked, what differs marked, and the resolve actions pinned to the bottom. */
export default function DuplicateCompare({
  pair,
  properties,
  canWrite,
  isStale,
  refreshControl,
}: {
  pair: DuplicatePair;
  properties: readonly Property[];
  canWrite: boolean;
  isStale: boolean;
  refreshControl: ReactElement<RefreshControlProps>;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const { transaction_a: a, transaction_b: b } = pair;
  const [choices, setChoices] = useState<MergeChoices>(() => computeDefaults(a, b));
  const actions = useDuplicateActions(pair);
  const differing = differingFields(a, b);
  const differingSet: ReadonlySet<MergeableField> = new Set(differing);

  async function leaveIf(succeeded: Promise<boolean>): Promise<void> {
    if (await succeeded) router.back();
  }

  async function merge(): Promise<void> {
    if (await confirmDuplicateChange("merge")) await leaveIf(actions.merge(choices));
  }

  async function keep(side: MergeFieldSide): Promise<void> {
    if (await confirmDuplicateChange("keep")) await leaveIf(actions.keep(side));
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} refreshControl={refreshControl}>
        {isStale ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
        {canWrite ? null : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.viewOnly}</Text>}
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {duplicateHeadline(pair)}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            <DuplicateChip label={duplicateConfidenceLabel(pair.confidence ?? "medium")} />
            {pair.property_match ? null : <DuplicateChip label={MESSAGES.differentProperties} />}
          </View>
        </View>
        {(["a", "b"] as const).map((side) => (
          <DuplicateCandidate
            differing={differingSet}
            disabled={actions.busy !== null}
            key={side}
            keepLoading={typeof actions.busy === "object" && actions.busy?.keep === side}
            onKeep={canWrite ? () => keep(side) : undefined}
            properties={properties}
            side={side}
            txn={side === "a" ? a : b}
          />
        ))}
        {canWrite ? (
          <DuplicateMergeChoices
            choices={choices}
            differing={differing}
            disabled={actions.busy !== null}
            onChoose={(field, side) => setChoices((current) => ({ ...current, [field]: side }))}
            properties={properties}
            txnA={a}
            txnB={b}
          />
        ) : null}
      </ScrollView>
      {canWrite ? <DuplicateActionBar busy={actions.busy} onDismiss={() => leaveIf(actions.dismiss())} onMerge={merge} /> : null}
    </View>
  );
}
