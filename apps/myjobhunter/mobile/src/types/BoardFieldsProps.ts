export interface BoardFieldsProps {
  /** The board token or company slug, as typed. */
  label: string;
  placeholder: string;
  value: string;
  onChangeValue: (value: string) => void;
  /** Said under the field: where to find it, or why it isn't valid. */
  hint: string;
  isInvalid: boolean;
  keywords: readonly string[];
  onChangeKeywords: (keywords: string[]) => void;
  keywordsDraft: string;
  onKeywordsDraftChange: (draft: string) => void;
  keywordsHint: string;
  disabled: boolean;
}
