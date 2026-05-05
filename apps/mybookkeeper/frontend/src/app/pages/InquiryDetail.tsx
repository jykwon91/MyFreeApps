import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetInquiryByIdQuery } from "@/shared/store/inquiriesApi";
import { useInquiryDetailMode } from "@/app/features/inquiries/useInquiryDetailMode";
import InquiryDetailBody from "@/app/features/inquiries/InquiryDetailBody";

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
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load this inquiry. Want me to try again?</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isFetching}
            loadingText="Retrying..."
            onClick={() => refetch()}
          >
            Retry
          </LoadingButton>
        </AlertBox>
      ) : null}

      <InquiryDetailBody mode={mode} inquiry={inquiry} />
    </main>
  );
}
