import type { CorrectionItem } from "@mylanguagetutor/api-client/types/tutor/correction-item";

export interface CorrectionCardProps {
  correction: CorrectionItem;
  languageName: string;
}
