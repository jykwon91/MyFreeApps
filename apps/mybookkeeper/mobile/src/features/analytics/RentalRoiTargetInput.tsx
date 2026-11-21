import {
  RENTAL_ROI_DEFAULT_TARGET_PCT,
  RENTAL_ROI_TARGET_DEBOUNCE_MS,
} from "@mybookkeeper/api-client/constants/rentalRoi";
import { parseTargetReturnPct } from "@mybookkeeper/api-client/utils/rentalRoi";
import { FIELD_PRESETS, LoadingRegion, useTheme } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { RENTAL_ROI_MESSAGES as MESSAGES } from "../../constants/rentalRoi";

export interface RentalRoiTargetInputProps {
  value: number;
  onChange: (pct: number) => void;
  isUpdating: boolean;
}

/**
 * Commits the typed return after a pause in typing (or on blur), clamped to
 * 0–100 with junk read as the default.
 */
export default function RentalRoiTargetInput({ value, onChange, isUpdating }: RentalRoiTargetInputProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [draft, setDraft] = useState(String(value));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelPending() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => cancelPending, []);

  function commit(text: string): number {
    const pct = parseTargetReturnPct(text);
    if (pct !== value) onChange(pct);
    return pct;
  }

  function handleChange(text: string) {
    setDraft(text);
    cancelPending();
    timer.current = setTimeout(() => commit(text), RENTAL_ROI_TARGET_DEBOUNCE_MS);
  }

  function handleBlur() {
    cancelPending();
    setDraft(String(commit(draft)));
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm }}>
        <Text
          accessibilityRole="text"
          style={{ fontSize: fontSize.sm, fontWeight: "500", color: colors.foreground }}
        >
          {MESSAGES.targetLabel}
        </Text>
        <TextInput
          {...FIELD_PRESETS.decimal}
          accessibilityLabel={MESSAGES.targetLabel}
          accessibilityValue={{ text: draft, min: 0, max: 100, now: parseTargetReturnPct(draft) }}
          editable
          onBlur={handleBlur}
          onChangeText={handleChange}
          placeholder={String(RENTAL_ROI_DEFAULT_TARGET_PCT)}
          returnKeyType="done"
          selectTextOnFocus
          style={{
            backgroundColor: colors.background,
            borderColor: colors.inputBorder,
            borderRadius: 8,
            borderWidth: 1,
            color: colors.foreground,
            fontSize: fontSize.sm,
            minHeight: 44,
            paddingHorizontal: spacing.sm,
            width: 72,
          }}
          testID="rental-roi-target-input"
          value={draft}
        />
        {isUpdating && (
          <LoadingRegion label={MESSAGES.updatingLabel} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <ActivityIndicator color={colors.mutedForeground} size="small" />
            <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.updatingLabel}</Text>
          </LoadingRegion>
        )}
      </View>
      <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.basedOn}</Text>
    </View>
  );
}
