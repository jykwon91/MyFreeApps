import type { ReviewCompanyState } from "@myjobhunter/api-client/types/application/review-company-state";

export interface CompanyFieldProps {
  company: ReviewCompanyState;
  onPress: () => void;
  disabled: boolean;
}
