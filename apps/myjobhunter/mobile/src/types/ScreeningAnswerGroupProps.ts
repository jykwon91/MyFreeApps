import type { ScreeningAnswer } from "@myjobhunter/api-client/types/screening-answer/screening-answer";

export interface ScreeningAnswerGroupProps {
  title: string;
  answers: readonly ScreeningAnswer[];
  onEdit: (answer: ScreeningAnswer) => void;
}
