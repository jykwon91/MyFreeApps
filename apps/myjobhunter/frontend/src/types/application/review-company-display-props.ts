import type { ReviewCompanyState } from "@myjobhunter/api-client/types/application/review-company-state";

export interface ReviewCompanyDisplayProps {
  company: ReviewCompanyState;
  onChangeRequest: () => void;
  onCompanyNameChange: (next: string) => void;
}
