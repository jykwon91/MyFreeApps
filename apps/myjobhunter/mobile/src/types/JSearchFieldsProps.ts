import type { FieldChain } from "@platform/mobile";
import type { JSearchFormValues } from "@myjobhunter/api-client/types/discovery/jsearch-form-values";
import type { ChipDraftField } from "./ChipDraftField";
import type { ChipDrafts } from "./ChipDrafts";
import type { SavedSearchChainField } from "./SavedSearchChainField";

export interface JSearchFieldsProps {
  values: JSearchFormValues;
  onChange: (patch: Partial<JSearchFormValues>) => void;
  drafts: ChipDrafts;
  onDraftChange: (field: ChipDraftField, draft: string) => void;
  roleSuggestions: readonly string[];
  skillSuggestions: readonly string[];
  disabled: boolean;
  /** The sheet's fields, so Return moves from the name into these and through them. */
  fields: FieldChain<SavedSearchChainField>;
}
