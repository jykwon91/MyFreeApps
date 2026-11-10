import { useGetLeaseTemplateByIdQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState, useLeaveWhenSaved, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { LEASE_TEMPLATE_MESSAGES as MESSAGES } from "../../constants/leaseTemplates";
import { useCanWrite } from "../workspace/useCanWrite";
import LeaseTemplateDetailBody from "./LeaseTemplateDetailBody";
import LeaseTemplateDetailSkeleton from "./LeaseTemplateDetailSkeleton";

export default function LeaseTemplateDetailScreen({ id }: { id: string }) {
  const canWrite = useCanWrite();
  const { currentData: template, error, isFetching, refetch } = useGetLeaseTemplateByIdQuery(id);
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const { isLeaving, leave } = useLeaveWhenSaved("/lease-templates");

  if (isLeaving || (!template && (isFetching || !error))) return <LeaseTemplateDetailSkeleton />;
  // A template deleted elsewhere has files that won't open, so the copy in memory can't be offered.
  const isGone = httpStatus(error) === 404;
  if (!template || isGone) {
    return (
      <EmptyState
        action={isGone ? { label: MESSAGES.back, onPress: () => router.back() } : { label: MESSAGES.tryAgain, onPress: refresh }}
        body={isGone ? MESSAGES.maybeDeleted : MESSAGES.tryAgainOffer}
        heading={isGone ? MESSAGES.cantFind : MESSAGES.couldntLoadOne}
      />
    );
  }
  return <LeaseTemplateDetailBody canWrite={canWrite} hasStaleData={Boolean(error)} onDeleted={leave} refreshControl={refreshControl} template={template} />;
}
