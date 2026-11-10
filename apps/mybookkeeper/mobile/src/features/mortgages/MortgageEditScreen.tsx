import { MORTGAGE_FORM_MESSAGES } from "../../constants/mortgageForm";
import RequireWrite from "../workspace/RequireWrite";
import MortgageDetailSkeleton from "./MortgageDetailSkeleton";
import MortgageEditLoader from "./MortgageEditLoader";

/** Edits a mortgage. A viewer is told they can't, and the mortgage isn't fetched for them. */
export default function MortgageEditScreen({ id }: { id: string }) {
  return (
    <RequireWrite body={MORTGAGE_FORM_MESSAGES.viewOnlyBody} heading={MORTGAGE_FORM_MESSAGES.viewOnlyHeading} loading={<MortgageDetailSkeleton />}>
      <MortgageEditLoader id={id} />
    </RequireWrite>
  );
}
