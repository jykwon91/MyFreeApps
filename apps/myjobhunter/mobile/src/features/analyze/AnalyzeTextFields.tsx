import { JD_TEXT_MAX_LENGTH } from "@myjobhunter/api-client/constants/addApplicationForm";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FormField, LoadingButton, useTheme } from "@platform/mobile";
import { MULTILINE_MIN_HEIGHT } from "../../constants/addApplication";
import { ANALYZE_MESSAGES as MESSAGES } from "../../constants/analyze";
import type { AnalyzeTextFieldsProps } from "../../types/AnalyzeTextFieldsProps";

/** A pasted job description, for postings a link can't be read from. Too long a paste is kept whole and said so. */
export default function AnalyzeTextFields({ value, error, onChange, onAnalyze }: AnalyzeTextFieldsProps) {
  const { spacing } = useTheme();
  return (
    <>
      <FormField
        counter={characterCounter(value.trim(), JD_TEXT_MAX_LENGTH)}
        error={error ?? undefined}
        hint={MESSAGES.textHint}
        inputStyle={{ minHeight: MULTILINE_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
        label={MESSAGES.textLabel}
        multiline
        onChangeText={onChange}
        placeholder={MESSAGES.textPlaceholder}
        value={value}
      />
      <LoadingButton disabled={value.trim() === "" || error !== null} loadingText={MESSAGES.analyzing} onPress={onAnalyze}>
        {MESSAGES.analyze}
      </LoadingButton>
    </>
  );
}
