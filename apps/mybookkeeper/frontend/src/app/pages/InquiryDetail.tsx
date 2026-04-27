import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Archive, Ban, Mail } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import Button from "@/shared/components/ui/Button";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import SourceBadge from "@/shared/components/ui/SourceBadge";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useDeleteInquiryMutation,
  useGetInquiryByIdQuery,
  useUpdateInquiryMutation,
} from "@/shared/store/inquiriesApi";
import {
  formatAbsoluteTime,
  formatLongDate,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import InquiryStageBadge from "@/app/features/inquiries/InquiryStageBadge";
import InquiryStageDropdown from "@/app/features/inquiries/InquiryStageDropdown";
import InquiryDetailSkeleton from "@/app/features/inquiries/InquiryDetailSkeleton";
import InquiryQualityBreakdown from "@/app/features/inquiries/InquiryQualityBreakdown";
import InquiryEventTimeline from "@/app/features/inquiries/InquiryEventTimeline";
import InquiryMessageThread from "@/app/features/inquiries/InquiryMessageThread";
import InquiryNotesEditor from "@/app/features/inquiries/InquiryNotesEditor";
import InquiryReplyPanel from "@/app/features/inquiries/InquiryReplyPanel";

export default function InquiryDetail() {
  const { inquiryId } = useParams<{ inquiryId: string }>();
  const navigate = useNavigate();
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showReplyPanel, setShowReplyPanel] = useState(false);
  const [updateInquiry, { isLoading: isPatching }] = useUpdateInquiryMutation();
  const [deleteInquiry, { isLoading: isDeleting }] = useDeleteInquiryMutation();

  const {
    data: inquiry,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetInquiryByIdQuery(inquiryId ?? "", { skip: !inquiryId });

  // Detail fetch already returns the messages list, so we can read the latest
  // inbound body and feed it into the quality breakdown — much more accurate
  // than the inbox card's 120-char preview.
  const lastInboundBody =
    inquiry?.messages
      .filter((m) => m.direction === "inbound")
      .map((m) => m.parsed_body ?? m.raw_email_body ?? "")
      .pop() ?? null;

  async function handleDecline() {
    if (!inquiry) return;
    try {
      await updateInquiry({
        id: inquiry.id,
        data: { stage: "declined" },
      }).unwrap();
      showSuccess("Inquiry declined.");
      setShowDeclineConfirm(false);
    } catch {
      showError("I couldn't decline that inquiry. Want to try again?");
    }
  }

  async function handleArchive() {
    if (!inquiry) return;
    try {
      await deleteInquiry(inquiry.id).unwrap();
      showSuccess("Inquiry archived.");
      setShowArchiveConfirm(false);
      navigate("/inquiries");
    } catch {
      showError("I couldn't archive that inquiry. Want to try again?");
    }
  }

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

      {isLoading || !inquiry ? (
        !isError ? <InquiryDetailSkeleton /> : null
      ) : (
        <>
          <SectionHeader
            title={inquiry.inquirer_name ?? "Unknown inquirer"}
            subtitle={
              <span className="inline-flex items-center gap-2 flex-wrap">
                <SourceBadge source={inquiry.source} />
                <InquiryStageBadge stage={inquiry.stage} />
                <span
                  className="text-xs text-muted-foreground"
                  title={formatAbsoluteTime(inquiry.received_at)}
                >
                  Received {formatRelativeTime(inquiry.received_at)}
                </span>
              </span>
            }
          />

          {/* Action row */}
          <div
            className="flex flex-wrap items-center gap-3"
            data-testid="inquiry-action-row"
          >
            <InquiryStageDropdown
              inquiryId={inquiry.id}
              currentStage={inquiry.stage}
            />
            <Button
              variant="primary"
              size="md"
              onClick={() => setShowReplyPanel(true)}
              data-testid="inquiry-reply-button"
              className="w-full sm:w-auto"
            >
              <Mail className="h-4 w-4 mr-1" />
              Reply with template
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowDeclineConfirm(true)}
              data-testid="inquiry-decline-button"
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <Ban className="h-4 w-4 mr-1" />
              Decline
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowArchiveConfirm(true)}
              data-testid="inquiry-archive-button"
            >
              <Archive className="h-4 w-4 mr-1" />
              Archive
            </Button>
          </div>

          {/* Inquirer details */}
          <section className="border rounded-lg p-4 space-y-3" data-testid="inquirer-section">
            <h2 className="text-sm font-medium">Inquirer details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Name</dt>
                <dd>{inquiry.inquirer_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Employer / hospital</dt>
                <dd>{inquiry.inquirer_employer ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd>
                  {inquiry.inquirer_email ? (
                    <a className="text-primary hover:underline" href={`mailto:${inquiry.inquirer_email}`}>
                      {inquiry.inquirer_email}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd>
                  {inquiry.inquirer_phone ? (
                    <a className="text-primary hover:underline" href={`tel:${inquiry.inquirer_phone}`}>
                      {inquiry.inquirer_phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </div>
          </section>

          {/* Stay details */}
          <section className="border rounded-lg p-4 space-y-3" data-testid="stay-section">
            <h2 className="text-sm font-medium">Stay details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Start date</dt>
                <dd>
                  {inquiry.desired_start_date
                    ? formatLongDate(inquiry.desired_start_date)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">End date</dt>
                <dd>
                  {inquiry.desired_end_date
                    ? formatLongDate(inquiry.desired_end_date)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Listing</dt>
                <dd>
                  {inquiry.listing_id ? (
                    <Link
                      to={`/listings/${inquiry.listing_id}`}
                      className="text-primary hover:underline"
                    >
                      View listing
                    </Link>
                  ) : (
                    "Not yet linked"
                  )}
                </dd>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="border rounded-lg p-4 space-y-3" data-testid="notes-section">
            <h2 className="text-sm font-medium">Notes</h2>
            <InquiryNotesEditor
              inquiryId={inquiry.id}
              initialNotes={inquiry.notes}
            />
          </section>

          {/* Quality breakdown */}
          <InquiryQualityBreakdown
            signals={{
              desired_start_date: inquiry.desired_start_date,
              desired_end_date: inquiry.desired_end_date,
              inquirer_employer: inquiry.inquirer_employer,
              last_message_body: lastInboundBody,
            }}
          />

          {/* Message thread */}
          <section className="space-y-3" data-testid="messages-section">
            <h2 className="text-sm font-medium">Messages</h2>
            <InquiryMessageThread messages={inquiry.messages} />
          </section>

          {/* Event timeline */}
          <InquiryEventTimeline events={inquiry.events} />

          <ConfirmDialog
            open={showDeclineConfirm}
            title="Decline this inquiry?"
            description="The inquiry will be moved to Declined and a timeline event will be recorded. You can move it back later if needed."
            confirmLabel="Decline"
            variant="danger"
            isLoading={isPatching}
            onConfirm={() => void handleDecline()}
            onCancel={() => setShowDeclineConfirm(false)}
          />

          <ConfirmDialog
            open={showArchiveConfirm}
            title="Archive this inquiry?"
            description="The inquiry will be soft-deleted and removed from the inbox. The audit trail and timeline are preserved."
            confirmLabel="Archive"
            variant="danger"
            isLoading={isDeleting}
            onConfirm={() => void handleArchive()}
            onCancel={() => setShowArchiveConfirm(false)}
          />

          {showReplyPanel ? (
            <InquiryReplyPanel
              inquiryId={inquiry.id}
              onClose={() => setShowReplyPanel(false)}
            />
          ) : null}
        </>
      )}
    </main>
  );
}
