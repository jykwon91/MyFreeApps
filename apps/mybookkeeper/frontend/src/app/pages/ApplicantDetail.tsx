import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetApplicantByIdQuery } from "@/shared/store/applicantsApi";
import {
  formatAbsoluteTime,
  formatLongDate,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import ApplicantStageBadge from "@/app/features/applicants/ApplicantStageBadge";
import ApplicantDetailSkeleton from "@/app/features/applicants/ApplicantDetailSkeleton";
import ApplicantTimelineList from "@/app/features/applicants/ApplicantTimelineList";
import ScreeningResultRow from "@/app/features/applicants/ScreeningResultRow";
import ReferenceRow from "@/app/features/applicants/ReferenceRow";
import VideoCallNoteCard from "@/app/features/applicants/VideoCallNoteCard";
import SensitiveDataUnlock from "@/app/features/applicants/SensitiveDataUnlock";

export default function ApplicantDetail() {
  const { applicantId } = useParams<{ applicantId: string }>();
  const {
    data: applicant,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetApplicantByIdQuery(applicantId ?? "", { skip: !applicantId });

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <Link
        to="/applicants"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to applicants
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

      {isLoading || !applicant ? (
        !isError ? <ApplicantDetailSkeleton /> : null
      ) : (
        <>
          <SectionHeader
            title={applicant.legal_name ?? "Unnamed applicant"}
            subtitle={
              <span className="inline-flex items-center gap-2 flex-wrap">
                <ApplicantStageBadge stage={applicant.stage} />
                <span
                  className="text-xs text-muted-foreground"
                  title={formatAbsoluteTime(applicant.created_at)}
                >
                  Promoted {formatRelativeTime(applicant.created_at)}
                </span>
                {applicant.inquiry_id ? (
                  <Link
                    to={`/inquiries/${applicant.inquiry_id}`}
                    data-testid="applicant-source-inquiry-link"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    View source inquiry
                  </Link>
                ) : null}
              </span>
            }
          />

          {/* Contract dates */}
          <section
            className="border rounded-lg p-4 space-y-3"
            data-testid="contract-section"
          >
            <h2 className="text-sm font-medium">Contract dates</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Start</dt>
                <dd>
                  {applicant.contract_start
                    ? formatLongDate(applicant.contract_start)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">End</dt>
                <dd>
                  {applicant.contract_end
                    ? formatLongDate(applicant.contract_end)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Pets</dt>
                <dd>{applicant.pets ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Smoker</dt>
                <dd>
                  {applicant.smoker === null
                    ? "—"
                    : applicant.smoker
                      ? "Yes"
                      : "No"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Referred by</dt>
                <dd>{applicant.referred_by ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">ID document</dt>
                <dd>
                  {applicant.id_document_storage_key ? (
                    <a
                      href={`/api/storage/${applicant.id_document_storage_key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="applicant-id-document-link"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      View document
                    </a>
                  ) : (
                    "Not uploaded"
                  )}
                </dd>
              </div>
            </div>
          </section>

          {/* Sensitive data — gated behind explicit unlock per RENTALS_PLAN.md §9.1 */}
          <SensitiveDataUnlock>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Legal name</dt>
                <dd data-testid="sensitive-legal-name">
                  {applicant.legal_name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Date of birth</dt>
                <dd data-testid="sensitive-dob">{applicant.dob ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Employer / hospital</dt>
                <dd data-testid="sensitive-employer">
                  {applicant.employer_or_hospital ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Vehicle</dt>
                <dd data-testid="sensitive-vehicle">
                  {applicant.vehicle_make_model ?? "—"}
                </dd>
              </div>
            </div>
          </SensitiveDataUnlock>

          {/* Screening results */}
          <section
            className="border rounded-lg p-4 space-y-3"
            data-testid="screening-section"
          >
            <h2 className="text-sm font-medium">Screening</h2>
            {applicant.screening_results.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No screening run yet.
              </p>
            ) : (
              <ul className="divide-y" data-testid="screening-list">
                {applicant.screening_results.map((result) => (
                  <ScreeningResultRow key={result.id} result={result} />
                ))}
              </ul>
            )}
          </section>

          {/* References */}
          <section
            className="border rounded-lg p-4 space-y-3"
            data-testid="references-section"
          >
            <h2 className="text-sm font-medium">References</h2>
            {applicant.references.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No references collected yet.
              </p>
            ) : (
              <ul className="divide-y" data-testid="references-list">
                {applicant.references.map((reference) => (
                  <ReferenceRow key={reference.id} reference={reference} />
                ))}
              </ul>
            )}
          </section>

          {/* Video-call notes */}
          <section className="space-y-3" data-testid="notes-section">
            <h2 className="text-sm font-medium">Video-call notes</h2>
            {applicant.video_call_notes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No video calls recorded yet.
              </p>
            ) : (
              <div className="space-y-3" data-testid="notes-list">
                {applicant.video_call_notes.map((note) => (
                  <VideoCallNoteCard key={note.id} note={note} />
                ))}
              </div>
            )}
          </section>

          {/* Activity timeline */}
          <ApplicantTimelineList events={applicant.events} />
        </>
      )}
    </main>
  );
}
