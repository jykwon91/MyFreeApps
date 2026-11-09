import { PROPERTY_PNL_PRESETS } from "@mybookkeeper/api-client/constants/propertyPnl";
import type { PropertyPnLRange } from "@mybookkeeper/api-client/types/attribution/property-pnl-range";
import { isValidPropertyPnlRange, propertyPnlRange } from "@mybookkeeper/api-client/utils/propertyPnlRange";
import { LoadingButton, MIN_TOUCH_TARGET, OptionRow, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { PROPERTY_PNL_MESSAGES as MESSAGES } from "../../constants/propertyPnl";
import CustomRangeFields from "../transactions/CustomRangeFields";
import { periodName } from "./propertyPnlDisplay";

interface PropertyPnlPeriodSheetProps {
  range: PropertyPnLRange;
  today: Date;
  onApply: (range: PropertyPnLRange) => void;
  onClose: () => void;
}

/** Mounted only while open, so its choice starts from what's applied and Close discards it. */
export default function PropertyPnlPeriodSheet({ range, today, onApply, onClose }: PropertyPnlPeriodSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [draft, setDraft] = useState(range);
  const [isCustom, setIsCustom] = useState(periodName(range, today) === MESSAGES.customRange);

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
              isSelected={!isCustom && draft.since === propertyPnlRange(preset.key, today).since}
              key={preset.key}
              label={preset.label}
              onPress={() => {
                setIsCustom(false);
                setDraft(propertyPnlRange(preset.key, today));
              }}
            />
          ))}
          <OptionRow isSelected={isCustom} label={MESSAGES.customRange} onPress={() => setIsCustom(true)} />
          {isCustom ? <CustomRangeFields endDate={draft.until} onChange={({ startDate, endDate }) => setDraft({ since: startDate, until: endDate })} startDate={draft.since} /> : null}
        </ScrollView>
        <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
          <LoadingButton disabled={!isValidPropertyPnlRange(draft)} onPress={() => onApply(draft)}>
            {MESSAGES.showResults}
          </LoadingButton>
        </View>
      </View>
    </Modal>
  );
}
