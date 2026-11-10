import type { ClassificationRuleMatchType } from "../types/classification-rule/classification-rule-match-type";

export const CLASSIFICATION_RULE_MATCH_TYPES: readonly ClassificationRuleMatchType[] = [
  "vendor",
  "sender",
  "filename",
  "keyword",
  "document_type",
];

export const CLASSIFICATION_RULE_MATCH_TYPE_LABELS: Record<ClassificationRuleMatchType, string> = {
  vendor: "Vendor",
  sender: "Sender",
  filename: "Filename",
  keyword: "Keyword",
  document_type: "Document type",
};

/** `source` values the server writes: "manual" (added by hand) and "user_correction" (learned from a category change). */
export const CLASSIFICATION_RULE_SOURCE_LABELS: Record<string, string> = {
  manual: "Added by hand",
  user_correction: "Learned from your correction",
};
