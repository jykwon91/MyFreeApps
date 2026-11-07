import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useGetInquiryByIdQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { resolveDetailLoadMode } from "@/shared/lib/detail-load-mode";
import InquiryDetailBody from "@/app/features/inquiries/InquiryDetailBody";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

export default function InquiryDetail() {
  const { inquiryId } = useParams<{ inquiryId: string }>();
  const {
    currentData: inquiry,
    error,
    isFetching,
    refetch,
  } = useGetInquiryByIdQuery(inquiryId ?? "", { skip: !inquiryId });

  const mode = resolveDetailLoadMode({ hasData: inquiry !== undefined, hasError: error !== undefined });

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <Link
        to="/inquiries"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to inquiries
      </Link>

      {error ? (
        <LoadErrorAlert message="I couldn't load this inquiry. Want me to try again?" isRetrying={isFetching} onRetry={() => refetch()} />
      ) : null}

      <InquiryDetailBody mode={mode} inquiry={inquiry} />
    </main>
  );
}
