import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useGetInquiryByIdQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { useInquiryDetailMode } from "@/app/features/inquiries/useInquiryDetailMode";
import InquiryDetailBody from "@/app/features/inquiries/InquiryDetailBody";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

export default function InquiryDetail() {
  const { inquiryId } = useParams<{ inquiryId: string }>();
  const {
    data: inquiry,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetInquiryByIdQuery(inquiryId ?? "", { skip: !inquiryId });

  const mode = useInquiryDetailMode({ isLoading, isError, inquiry });

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <Link
        to="/inquiries"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to inquiries
      </Link>

      {isError ? (
        <LoadErrorAlert message="I couldn't load this inquiry. Want me to try again?" isRetrying={isFetching} onRetry={() => refetch()} />
      ) : null}

      <InquiryDetailBody mode={mode} inquiry={inquiry} />
    </main>
  );
}
