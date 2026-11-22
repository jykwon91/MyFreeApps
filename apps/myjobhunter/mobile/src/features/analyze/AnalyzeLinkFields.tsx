import { JOB_URL_MAX_LENGTH } from "@myjobhunter/api-client/constants/addApplicationForm";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FIELD_PRESETS, FormField, LoadingButton } from "@platform/mobile";
import { ANALYZE_MESSAGES as MESSAGES } from "../../constants/analyze";
import type { AnalyzeLinkFieldsProps } from "../../types/AnalyzeLinkFieldsProps";

/** A job-posting link to analyze, typed or pasted. Pasting analyzes it straight away, as on the website. */
export default function AnalyzeLinkFields({ value, onChange, onAnalyze, onPaste }: AnalyzeLinkFieldsProps) {
  return (
    <>
      <FormField
        {...FIELD_PRESETS.url}
        counter={characterCounter(value.trim(), JOB_URL_MAX_LENGTH)}
        hint={MESSAGES.linkHint}
        label={MESSAGES.linkLabel}
        onChangeText={onChange}
        onSubmitEditing={() => void onAnalyze()}
        placeholder={MESSAGES.linkPlaceholder}
        returnKeyType="go"
        value={value}
      />
      <LoadingButton onPress={onPaste} variant="secondary">
        {MESSAGES.pasteLink}
      </LoadingButton>
      <LoadingButton disabled={value.trim() === ""} loadingText={MESSAGES.analyzing} onPress={onAnalyze}>
        {MESSAGES.analyze}
      </LoadingButton>
    </>
  );
}
