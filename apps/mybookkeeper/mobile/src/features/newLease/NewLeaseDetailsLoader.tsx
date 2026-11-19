import { useLeaseTemplateNames } from "@mybookkeeper/api-client/hooks/useLeaseTemplateNames";
import { useGetApplicantByIdQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { useGetMultiGenerateDefaultsQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { askedFields, computedFields } from "@mybookkeeper/api-client/utils/leasePlaceholders";
import { EmptyState, useRefresh, goBackOr } from "@platform/mobile";
import { NEW_LEASE_MESSAGES as MESSAGES } from "../../constants/newLease";
import type { NewLeaseFlow } from "../../types/NewLeaseFlow";
import { applicantName } from "../applicants/applicantDisplay";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import NewLeaseDetailsSkeleton from "./NewLeaseDetailsSkeleton";
import NewLeaseForm from "./NewLeaseForm";

export default function NewLeaseDetailsLoader({ flow }: { flow: NewLeaseFlow }) {
  const applicantId = flow.applicantId ?? "";
  // Pulled fresh on arrival: the applicant may have just been edited.
  const defaults = useGetMultiGenerateDefaultsQuery({ template_ids: flow.templateIds, applicant_id: applicantId }, { refetchOnMountOrArgChange: true });
  const applicant = useGetApplicantByIdQuery(applicantId);
  // Only for the "Used in" hint, so the form doesn't wait on it.
  const templateNames = useLeaseTemplateNames(flow.templateIds);
  const error = defaults.error ?? applicant.error;
  const { refresh } = useRefresh(() => Promise.all([defaults.refetch(), applicant.refetch()]), error);

  if (defaults.currentData && applicant.currentData) {
    return (
      <NewLeaseForm
        applicantId={applicantId}
        applicantName={applicantName(applicant.currentData.legal_name)}
        computed={computedFields(defaults.currentData.placeholders)}
        fields={askedFields(defaults.currentData.placeholders)}
        flow={flow}
        onOutOfDate={() => void defaults.refetch()}
        templateNames={templateNames}
      />
    );
  }
  if (!error) return <NewLeaseDetailsSkeleton />;
  if (httpStatus(defaults.error) === 404 || httpStatus(applicant.error) === 404) {
    return <EmptyState action={{ label: MESSAGES.goBack, onPress: () => goBackOr("/leases") }} body={MESSAGES.cantFindBody} heading={MESSAGES.cantFindHeading} />;
  }
  return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoadDetails} />;
}
