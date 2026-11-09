import { isValidPropertyPnlRange } from "@mybookkeeper/api-client/utils/propertyPnlRange";
import { LoadingButton, MIN_TOUCH_TARGET, OptionRow, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { isoFromDate } from "../../lib/localDate";
import type { PeriodSheetProps } from "../../types/PeriodSheetProps";
import CustomRangeFields from "../transactions/CustomRangeFields";

/** Pick a named period or hand-picked dates. Mounted only while open, so its choice starts from what's applied and Close discards it. */
export default function PeriodSheet<K extends string>({ choices, selection, today, messages, onApply, onClose }: PeriodSheetProps<K>) {
  const { colors, spacing, fontSize } = useTheme();
  const [draft, setDraft] = useState(selection);
  const isCustom = draft.key === null;
  const todayIso = isoFromDate(today);
  const customRange = draft.range ?? { since: todayIso, until: todayIso };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {messages.periodSheetTitle}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.lg }}>
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{messages.close}</Text>
          </Pressable>
        </View>
        <ScrollView>
          {choices.map((choice) => (
            <OptionRow isSelected={draft.key === choice.key} key={choice.key} label={choice.label} onPress={() => setDraft({ key: choice.key, range: choice.range })} />
          ))}
          <OptionRow isSelected={isCustom} label={messages.customRange} onPress={() => setDraft({ key: null, range: customRange })} />
          {isCustom ? (
            <CustomRangeFields
              endDate={customRange.until}
              onChange={({ startDate, endDate }) => setDraft({ key: null, range: { since: startDate, until: endDate } })}
              startDate={customRange.since}
            />
          ) : null}
        </ScrollView>
        <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
          <LoadingButton disabled={draft.range !== null && !isValidPropertyPnlRange(draft.range)} onPress={() => onApply(draft)}>
            {messages.showResults}
          </LoadingButton>
        </View>
      </View>
    </Modal>
  );
}
