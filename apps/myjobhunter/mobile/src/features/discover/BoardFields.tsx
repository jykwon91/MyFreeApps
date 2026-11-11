import { FormField } from "@platform/mobile";
import { SAVED_SEARCH_SHEET_MESSAGES as MESSAGES } from "../../constants/savedSearchSheet";
import ChipListField from "../../components/forms/ChipListField";
import type { BoardFieldsProps } from "../../types/BoardFieldsProps";

/** A Greenhouse or Lever saved search's fields: the board's token or slug, checked as it's typed, and keywords to leave out. */
export default function BoardFields({ label, placeholder, value, onChangeValue, hint, isInvalid, keywords, onChangeKeywords, keywordsDraft, onKeywordsDraftChange, keywordsHint, disabled }: BoardFieldsProps) {
  return (
    <>
      <FormField
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        editable={!disabled}
        error={isInvalid ? hint : undefined}
        hint={isInvalid ? undefined : hint}
        label={label}
        onChangeText={onChangeValue}
        placeholder={placeholder}
        required
        spellCheck={false}
        value={value}
      />
      <ChipListField disabled={disabled} draft={keywordsDraft} hint={keywordsHint} label={MESSAGES.boardKeywordsLabel} onChange={onChangeKeywords} onDraftChange={onKeywordsDraftChange} placeholder={MESSAGES.keywordsPlaceholder} values={keywords} />
    </>
  );
}
