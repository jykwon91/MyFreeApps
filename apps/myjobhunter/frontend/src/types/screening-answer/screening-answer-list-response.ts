import type { ScreeningAnswer } from "./screening-answer";

export interface ScreeningAnswerListResponse {
  items: ScreeningAnswer[];
  total: number;
}
