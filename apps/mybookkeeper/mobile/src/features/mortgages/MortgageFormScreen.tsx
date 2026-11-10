import { MORTGAGE_FORM_MESSAGES as MESSAGES } from "../../constants/mortgageForm";
import RequireWrite from "../workspace/RequireWrite";
import MortgageDetailSkeleton from "./MortgageDetailSkeleton";
import MortgageForm from "./MortgageForm";

export default function MortgageFormScreen() {
  return (
    <RequireWrite loading={<MortgageDetailSkeleton />} body={MESSAGES.viewOnlyBody} heading={MESSAGES.viewOnlyHeading}>
      <MortgageForm original={null} />
    </RequireWrite>
  );
}
