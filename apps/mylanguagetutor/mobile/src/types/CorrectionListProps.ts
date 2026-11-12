import type { CorrectionItem } from "@mylanguagetutor/api-client/types/tutor/correction-item";

export interface CorrectionListProps {
  corrections: CorrectionItem[];
  languageName: string;
}
