import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetApplicantByIdQuery } from "@/shared/store/applicantsApi";
import ApplicantDetailSkeleton from "@/app/features/applicants/ApplicantDetailSkeleton";
import ApplicantDetailBody from "@/app/features/applicants/ApplicantDetailBody";
import { useApplicantDetailMode } from "@/app/features/applicants/useApplicantDetailMode";

export default function ApplicantDetail() {
  const { applicantId } = useParams<{ applicantId: string }>();
  const location = useLocation();
  const isTenantContext = location.pathname.startsWith("/tenants/");

  const {
    data: applicant,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetApplicantByIdQuery(applicantId ?? "", { skip: !applicantId });

  const mode = useApplicantDetailMode({ isLoading, isError, applicant });

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <Link
        to={isTenantContext ? "/tenants" : "/applicants"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to {isTenantContext ? "tenants" : "applicants"}
      </Link>

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't find that applicant. Maybe it was removed?</span>
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

      {mode === "loading" ? <ApplicantDetailSkeleton /> : null}
      {mode === "content" ? <ApplicantDetailBody applicant={applicant!} /> : null}
    </main>
  );
}
