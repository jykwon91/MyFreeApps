import { isValidPropertyPnlRange } from "@mybookkeeper/api-client/utils/propertyPnlRange";
import { LoadingButton, MIN_TOUCH_TARGET, OptionRow, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import type { AnalysisChoice } from "../../types/AnalysisChoice";
import type { AnalysisSelection } from "../../types/AnalysisSelection";
import CustomRangeFields from "../transactions/CustomRangeFields";
import { choiceSelection } from "./analysisPeriod";

interface AnalysisPeriodSheetProps {
  choices: readonly AnalysisChoice[];
  selection: AnalysisSelection;
  today: Date;
  onApply: (selection: AnalysisSelection) => void;
  onClose: () => void;
}

/** Mounted only while open, so its choice starts from what's applied and Close discards it. */
export default function AnalysisPeriodSheet({ choices, selection, today, onApply, onClose }: AnalysisPeriodSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [draft, setDraft] = useState<AnalysisSelection>(selection);
  const isCustom = draft.key === null;
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const customRange = draft.range ?? { since: todayIso, until: todayIso };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.periodSheetTitle}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.lg }}>
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{MESSAGES.close}</Text>
          </Pressable>
        </View>
        <ScrollView>
          {choices.map((choice) => (
            <OptionRow isSelected={draft.key === choice.key} key={choice.key} label={choice.label} onPress={() => setDraft(choiceSelection(choice))} />
          ))}
          <OptionRow isSelected={isCustom} label={MESSAGES.customRange} onPress={() => setDraft({ key: null, range: customRange })} />
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
            {MESSAGES.showResults}
          </LoadingButton>
        </View>
      </View>
    </Modal>
  );
}
