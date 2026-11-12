import { JOB_URL_MAX_LENGTH } from "@myjobhunter/api-client/constants/addApplicationForm";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FormField, LoadingButton } from "@platform/mobile";
import { ADD_APPLICATION_MESSAGES as MESSAGES } from "../../constants/addApplication";
import type { LinkSourceFieldsProps } from "../../types/LinkSourceFieldsProps";
import ReadingHint from "./ReadingHint";

/** A job-posting link to read, typed or pasted. Pasting reads it straight away, as on the website. */
export default function LinkSourceFields({ value, onChange, onRead, onPaste, isReading, disabled, isLongRunning }: LinkSourceFieldsProps) {
  const locked = isReading || disabled;
  return (
    <>
      <FormField
        autoCapitalize="none"
        autoCorrect={false}
        counter={characterCounter(value.trim(), JOB_URL_MAX_LENGTH)}
        editable={!locked}
        hint={MESSAGES.linkHint}
        keyboardType="url"
        label={MESSAGES.linkLabel}
        onChangeText={onChange}
        onSubmitEditing={() => void onRead()}
        placeholder={MESSAGES.linkPlaceholder}
        returnKeyType="go"
        textContentType="URL"
        value={value}
      />
      <LoadingButton disabled={locked} onPress={onPaste} variant="secondary">
        {MESSAGES.pasteLink}
      </LoadingButton>
      <LoadingButton disabled={locked || value.trim() === ""} isLoading={isReading} loadingText={MESSAGES.readingLink} onPress={onRead}>
        {MESSAGES.autoFill}
      </LoadingButton>
      {isReading ? <ReadingHint isLongRunning={isLongRunning} /> : null}
    </>
  );
}
