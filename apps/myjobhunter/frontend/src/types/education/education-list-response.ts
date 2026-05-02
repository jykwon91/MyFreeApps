import type { Education } from "./education";

export interface EducationListResponse {
  items: Education[];
  total: number;
}
