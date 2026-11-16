import { useGetInquiryByIdQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { EmptyState, goBackOr } from "@platform/mobile";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import PromoteForm from "./PromoteForm";
import PromoteSkeleton from "./PromoteSkeleton";

export default function PromoteLoader({ id }: { id: string }) {
  const { currentData: inquiry, error, isFetching, refetch } = useGetInquiryByIdQuery(id);
  const isGone = httpStatus(error) === 404;

  if (inquiry) return <PromoteForm inquiry={inquiry} />;
  if (!isGone && (isFetching || !error)) return <PromoteSkeleton />;
  return (
    <EmptyState
      action={isGone ? { label: "Back", onPress: () => goBackOr(`/inquiries/${id}`) } : { label: "Try again", onPress: () => void refetch() }}
      body={isGone ? "It may have been archived." : "Want me to try again?"}
      heading={isGone ? "I can't find that inquiry." : "I couldn't load that inquiry."}
    />
  );
}
