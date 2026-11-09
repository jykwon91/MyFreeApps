import { PROPERTY_PNL_PRESETS } from "@mybookkeeper/api-client/constants/propertyPnl";
import { isValidPropertyPnlRange, propertyPnlRange } from "@mybookkeeper/api-client/utils/propertyPnlRange";
import { LoadingButton, MIN_TOUCH_TARGET, OptionRow, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { PROPERTY_PNL_MESSAGES as MESSAGES } from "../../constants/propertyPnl";
import type { PropertyPnlSelection } from "../../types/PropertyPnlSelection";
import CustomRangeFields from "../transactions/CustomRangeFields";

interface PropertyPnlPeriodSheetProps {
  selection: PropertyPnlSelection;
  today: Date;
  onApply: (selection: PropertyPnlSelection) => void;
  onClose: () => void;
}

/** Mounted only while open, so its choice starts from what's applied and Close discards it. */
export default function PropertyPnlPeriodSheet({ selection, today, onApply, onClose }: PropertyPnlPeriodSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [draft, setDraft] = useState(selection);
  const isCustom = draft.preset === null;

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.periodSheetTitle}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.lg }}
          >
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{MESSAGES.close}</Text>
          </Pressable>
        </View>
        <ScrollView>
          {PROPERTY_PNL_PRESETS.map((preset) => (
            <OptionRow
              isSelected={draft.preset === preset.key}
              key={preset.key}
              label={preset.label}
              onPress={() => setDraft({ range: propertyPnlRange(preset.key, today), preset: preset.key })}
            />
          ))}
          <OptionRow isSelected={isCustom} label={MESSAGES.customRange} onPress={() => setDraft({ ...draft, preset: null })} />
          {isCustom ? <CustomRangeFields
              endDate={draft.range.until}
              onChange={({ startDate, endDate }) => setDraft({ range: { since: startDate, until: endDate }, preset: null })}
              startDate={draft.range.since}
            /> : null}
        </ScrollView>
        <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
          <LoadingButton disabled={!isValidPropertyPnlRange(draft.range)} onPress={() => onApply(draft)}>
            {MESSAGES.showResults}
          </LoadingButton>
        </View>
      </View>
    </Modal>
  );
}
