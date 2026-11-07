import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useGetApplicantByIdQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import ApplicantDetailSkeleton from "@/app/features/applicants/ApplicantDetailSkeleton";
import ApplicantDetailBody from "@/app/features/applicants/ApplicantDetailBody";
import { useApplicantDetailMode } from "@/app/features/applicants/useApplicantDetailMode";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

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
        <LoadErrorAlert message="I couldn't find that applicant. Maybe it was removed?" isRetrying={isFetching} onRetry={() => refetch()} />
      ) : null}

      {mode === "loading" ? <ApplicantDetailSkeleton /> : null}
      {mode === "content" ? <ApplicantDetailBody key={applicant!.id} applicant={applicant!} /> : null}
    </main>
  );
}
