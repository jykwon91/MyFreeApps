import { INTERVIEW_LOCATION_MAX_LENGTH } from "@myjobhunter/api-client/constants/interviewDetailLimits";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FormField, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { APPLICATION_EVENT_MESSAGES as MESSAGES } from "../../constants/applicationEvents";
import { INTERVIEW_TYPE_OPTIONS } from "../../constants/eventOptions";
import type { InterviewDetailsFieldsProps } from "../../types/InterviewDetailsFieldsProps";
import ChoiceGroup from "../../components/forms/ChoiceGroup";
import DateTimeField from "./DateTimeField";

/** The website's interview details: only the type is required, the rest is what's known so far. */
export default function InterviewDetailsFields({ values, onChange, errors, disabled }: InterviewDetailsFieldsProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}>
        {MESSAGES.interviewDetails}
      </Text>
      <ChoiceGroup
        disabled={disabled}
        error={errors.interview_type}
        label={MESSAGES.typeLabel}
        onChange={(type) => onChange("interview_type", type)}
        options={INTERVIEW_TYPE_OPTIONS}
        required
        value={values.interview_type}
      />
      <DateTimeField disabled={disabled} label={MESSAGES.scheduledLabel} onChange={(next) => onChange("interview_scheduled_at", next)} value={values.interview_scheduled_at} />
      <FormField
        editable={!disabled}
        error={errors.interview_duration_minutes}
        keyboardType="number-pad"
        label={MESSAGES.durationLabel}
        onChangeText={(next) => onChange("interview_duration_minutes", next)}
        placeholder={MESSAGES.durationPlaceholder}
        value={values.interview_duration_minutes}
      />
      <FormField
        autoCapitalize="none"
        editable={!disabled}
        counter={characterCounter(values.interview_location_or_link.trim(), INTERVIEW_LOCATION_MAX_LENGTH)}
        error={errors.interview_location_or_link}
        label={MESSAGES.locationLabel}
        onChangeText={(next) => onChange("interview_location_or_link", next)}
        placeholder={MESSAGES.locationPlaceholder}
        value={values.interview_location_or_link}
      />
      <FormField
        editable={!disabled}
        error={errors.interview_interviewer_names}
        hint={MESSAGES.interviewersHint}
        label={MESSAGES.interviewersLabel}
        multiline
        onChangeText={(next) => onChange("interview_interviewer_names", next)}
        value={values.interview_interviewer_names}
      />
    </View>
  );
}
