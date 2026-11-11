import CompanyConfirmationPill from "../CompanyConfirmationPill";
import type { ReviewCompanyDisplayProps } from "@/types/application/review-company-display-props";

/** The company on the review step: a pill, tracked, new or failed, that offers to change it. */
export default function ReviewCompanyDisplay({ company, onChangeRequest, onCompanyNameChange }: ReviewCompanyDisplayProps) {
  function handleChange() {
    onCompanyNameChange(company.name);
    onChangeRequest();
  }

  if (company.kind === "tracked") {
    return (
      <CompanyConfirmationPill
        name={company.name}
        logoUrl={company.logoUrl}
        variant="tracked"
        onChangeRequest={handleChange}
      />
    );
  }
  if (company.kind === "new" || company.kind === "manual") {
    return (
      <CompanyConfirmationPill
        name={company.name}
        logoUrl={company.logoUrl}
        variant="new"
        onChangeRequest={handleChange}
      />
    );
  }
  // autoCreateFailed
  return (
    <CompanyConfirmationPill
      name={company.name || "(no company found)"}
      logoUrl={null}
      variant="error"
      onChangeRequest={handleChange}
    />
  );
}
