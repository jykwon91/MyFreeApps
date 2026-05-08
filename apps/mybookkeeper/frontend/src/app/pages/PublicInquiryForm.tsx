import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/shared/lib/api";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import type { PublicListing } from "@/shared/types/inquiry/public-listing";
import { usePublicInquiryFlow } from "@/app/features/public-inquiry/usePublicInquiryFlow";
import PublicInquiryListingPanel from "@/app/features/public-inquiry/PublicInquiryListingPanel";
import PublicInquiryFormStep from "@/app/features/public-inquiry/PublicInquiryFormStep";
import PublicInquirySuccessStep from "@/app/features/public-inquiry/PublicInquirySuccessStep";

export default function PublicInquiryForm() {
  const { slug = "" } = useParams<{ slug: string }>();

  const [listing, setListing] = useState<PublicListing | null>(null);
  const [listingLoading, setListingLoading] = useState(true);
  const [listingError, setListingError] = useState<string | null>(null);

  const flow = usePublicInquiryFlow();

  useEffect(() => {
    let cancelled = false;

    api
      .get<PublicListing>(`/listings/public/${slug}`)
      .then(({ data }) => {
        if (cancelled) return;
        setListing(data);
        setListingError(null);
        setListingLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setListing(null);
        setListingError(extractErrorMessage(err));
        setListingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (listingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-md shadow-sm">
          <div className="space-y-3 animate-pulse" data-testid="public-form-skeleton">
            <div className="h-6 w-2/3 bg-muted-foreground/20 rounded" />
            <div className="h-4 w-full bg-muted-foreground/10 rounded" />
            <div className="h-4 w-1/2 bg-muted-foreground/10 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (listingError || !listing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center">
          <h1 className="text-2xl font-semibold mb-4">Listing not found</h1>
          <p className="text-sm text-muted-foreground">
            This inquiry link is no longer available. Please check the link or
            contact the host for an updated URL.
          </p>
        </div>
      </div>
    );
  }

  if (flow.submitted) {
    return <PublicInquirySuccessStep />;
  }

  return (
    <div className="min-h-screen bg-muted py-6 sm:py-12">
      <div className="mx-auto max-w-xl px-4">
        <div className="bg-card border rounded-lg shadow-sm p-6 sm:p-8">
          <PublicInquiryListingPanel listing={listing} />
          <PublicInquiryFormStep
            listing={listing}
            form={flow.form}
            submitting={flow.submitting}
            submitError={flow.submitError}
            visibleErrors={flow.visibleErrors}
            errorCount={flow.errorCount}
            attemptedSubmit={flow.attemptedSubmit}
            turnstileRequired={flow.turnstileRequired}
            turnstileError={flow.turnstileError}
            update={flow.update}
            markTouched={flow.markTouched}
            onTurnstileVerify={flow.handleTurnstileVerify}
            onTurnstileExpire={flow.handleTurnstileExpire}
            onSubmit={(e) => flow.handleSubmit(e, listing)}
          />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Powered by MyBookkeeper
        </p>
      </div>
    </div>
  );
}
