import type { Company } from "@myjobhunter/api-client/types/company";

export interface CompanyRowProps {
  company: Company;
  /** Opens the company's page. */
  onPress: () => void;
}
