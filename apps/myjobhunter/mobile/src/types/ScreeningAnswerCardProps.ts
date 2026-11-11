import type { ScreeningAnswer } from "@myjobhunter/api-client/types/screening-answer/screening-answer";

export interface ScreeningAnswerCardProps {
  answer: ScreeningAnswer;
  onEdit: () => void;
}
