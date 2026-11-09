import { useGetLeaseTemplateByIdQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { FORM_MESSAGES } from "../../constants/forms";
import { LEASE_TEMPLATE_MESSAGES as MESSAGES } from "../../constants/leaseTemplates";
import { useCanWrite } from "../workspace/useCanWrite";
import LeaseTemplateDetailSkeleton from "./LeaseTemplateDetailSkeleton";
import type { LeaseTemplateGateProps } from "../../types/LeaseTemplateGateProps";

/** Loads a template for a screen that hangs off it: skeleton, a failed load with Try again, a gone template, and view-only. */
export default function LeaseTemplateGate({ id, requireWrite = false, children }: LeaseTemplateGateProps) {
  const canWrite = useCanWrite();
  const { currentData: template, error, isFetching, refetch } = useGetLeaseTemplateByIdQuery(id);

  if (requireWrite && !canWrite) return <EmptyState body={FORM_MESSAGES.viewOnlyBody} heading={FORM_MESSAGES.viewOnlyHeading} />;
  if (template) return children(template);
  if (isFetching || !error) return <LeaseTemplateDetailSkeleton />;
  const isGone = httpStatus(error) === 404;
  return (
    <EmptyState
      action={isGone ? { label: MESSAGES.back, onPress: () => router.back() } : { label: MESSAGES.tryAgain, onPress: () => void refetch() }}
      body={isGone ? MESSAGES.maybeDeleted : MESSAGES.tryAgainOffer}
      heading={isGone ? MESSAGES.cantFind : MESSAGES.couldntLoadOne}
    />
  );
}
