import { JD_TEXT_MAX_LENGTH } from "@myjobhunter/api-client/constants/addApplicationForm";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FormField, LoadingButton, useTheme } from "@platform/mobile";
import { ADD_APPLICATION_MESSAGES as MESSAGES, MULTILINE_MIN_HEIGHT } from "../../constants/addApplication";
import type { TextSourceFieldsProps } from "../../types/TextSourceFieldsProps";
import ReadingHint from "./ReadingHint";

/** A pasted job description, for postings a link can't be read from. */
export default function TextSourceFields({ value, error, onChange, onRead, isReading, isLongRunning }: TextSourceFieldsProps) {
  const { spacing } = useTheme();
  return (
    <>
      <FormField
        counter={characterCounter(value.trim(), JD_TEXT_MAX_LENGTH)}
        editable={!isReading}
        error={error ?? undefined}
        hint={MESSAGES.textHint}
        inputStyle={{ minHeight: MULTILINE_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
        label={MESSAGES.textLabel}
        multiline
        onChangeText={onChange}
        placeholder={MESSAGES.textPlaceholder}
        value={value}
      />
      <LoadingButton disabled={isReading || value.trim() === "" || error !== null} isLoading={isReading} loadingText={MESSAGES.readingText} onPress={onRead}>
        {MESSAGES.autoFillFromText}
      </LoadingButton>
      {isReading ? <ReadingHint isLongRunning={isLongRunning} /> : null}
    </>
  );
}
