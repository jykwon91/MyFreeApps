import type { JSearchFormValues } from "@myjobhunter/api-client/types/discovery/jsearch-form-values";
import type { ChipDraftField } from "./ChipDraftField";
import type { ChipDrafts } from "./ChipDrafts";

export interface JSearchFieldsProps {
  values: JSearchFormValues;
  onChange: (patch: Partial<JSearchFormValues>) => void;
  drafts: ChipDrafts;
  onDraftChange: (field: ChipDraftField, draft: string) => void;
  roleSuggestions: readonly string[];
  skillSuggestions: readonly string[];
  disabled: boolean;
}
