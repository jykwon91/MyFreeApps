import { useGetApplicantByIdQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { useGetLeaseTemplatesQuery, useGetMultiGenerateDefaultsQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { EmptyState, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo } from "react";
import { LEASE_TEMPLATE_LIST_LIMIT } from "../../constants/leaseTemplates";
import { NEW_LEASE_MESSAGES as MESSAGES } from "../../constants/newLease";
import type { NewLeaseFlow } from "../../types/NewLeaseFlow";
import { applicantName } from "../applicants/applicantDisplay";
import { httpStatus } from "../transactions/transactionMessages";
import NewLeaseDetailsSkeleton from "./NewLeaseDetailsSkeleton";
import NewLeaseForm from "./NewLeaseForm";

export default function NewLeaseDetailsScreen({ flow }: { flow: NewLeaseFlow }) {
  const applicantId = flow.applicantId ?? "";
  // Pulled fresh on arrival: the applicant may have just been edited.
  const defaults = useGetMultiGenerateDefaultsQuery({ template_ids: flow.templateIds, applicant_id: applicantId }, { refetchOnMountOrArgChange: true });
  const applicant = useGetApplicantByIdQuery(applicantId);
  const { currentData: templates } = useGetLeaseTemplatesQuery({ limit: LEASE_TEMPLATE_LIST_LIMIT });
  const error = defaults.error ?? applicant.error;
  const { refresh } = useRefresh(() => Promise.all([defaults.refetch(), applicant.refetch()]), error);
  // Only for the "Used in" hint, so the form doesn't wait on it.
  const templateNames = useMemo(() => Object.fromEntries((templates?.items ?? []).map((template) => [template.id, template.name])), [templates]);

  if (defaults.currentData && applicant.currentData) {
    return (
      <NewLeaseForm
        applicantId={applicantId}
        applicantName={applicantName(applicant.currentData.legal_name)}
        fields={defaults.currentData.placeholders}
        flow={flow}
        onOutOfDate={() => void defaults.refetch()}
        templateNames={templateNames}
      />
    );
  }
  if (!error) return <NewLeaseDetailsSkeleton />;
  if (httpStatus(defaults.error) === 404 || httpStatus(applicant.error) === 404) {
    return <EmptyState action={{ label: MESSAGES.goBack, onPress: () => router.back() }} body={MESSAGES.cantFindBody} heading={MESSAGES.cantFindHeading} />;
  }
  return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoadDetails} />;
}
