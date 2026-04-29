import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetVendorByIdQuery } from "@/shared/store/vendorsApi";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import VendorCategoryBadge from "@/app/features/vendors/VendorCategoryBadge";
import VendorDetailSkeleton from "@/app/features/vendors/VendorDetailSkeleton";

function formatHourlyRate(rate: string | null): string {
  if (rate === null) return "Not set";
  const num = Number(rate);
  if (Number.isNaN(num)) return "Not set";
  return `$${num.toFixed(2)} / hour`;
}

export default function VendorDetail() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const {
    data: vendor,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetVendorByIdQuery(vendorId ?? "", { skip: !vendorId });

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <Link
        to="/vendors"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to vendors
      </Link>

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't find that vendor. Maybe it was removed?</span>
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

      {isLoading || !vendor ? (
        !isError ? <VendorDetailSkeleton /> : null
      ) : (
        <>
          <SectionHeader
            title={vendor.name}
            subtitle={
              <span className="inline-flex items-center gap-2 flex-wrap">
                {vendor.preferred ? (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 dark:text-yellow-300"
                    data-testid="vendor-preferred-indicator"
                  >
                    <Star
                      className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500"
                      aria-hidden="true"
                    />
                    Preferred
                  </span>
                ) : null}
                <VendorCategoryBadge category={vendor.category} />
                {vendor.last_used_at ? (
                  <span
                    className="text-xs text-muted-foreground"
                    title={formatAbsoluteTime(vendor.last_used_at)}
                  >
                    Last used {formatRelativeTime(vendor.last_used_at)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Never used
                  </span>
                )}
              </span>
            }
          />

          {/* Contact info */}
          <section
            className="border rounded-lg p-4 space-y-3"
            data-testid="contact-section"
          >
            <h2 className="text-sm font-medium">Contact</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd data-testid="vendor-phone">
                  {vendor.phone ? (
                    <a
                      href={`tel:${vendor.phone}`}
                      className="text-primary hover:underline"
                    >
                      {vendor.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd data-testid="vendor-email">
                  {vendor.email ? (
                    <a
                      href={`mailto:${vendor.email}`}
                      className="text-primary hover:underline break-all"
                    >
                      {vendor.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Address</dt>
                <dd data-testid="vendor-address" className="whitespace-pre-line">
                  {vendor.address ?? "—"}
                </dd>
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section
            className="border rounded-lg p-4 space-y-3"
            data-testid="pricing-section"
          >
            <h2 className="text-sm font-medium">Pricing</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Hourly rate</dt>
                <dd data-testid="vendor-hourly-rate">
                  {formatHourlyRate(vendor.hourly_rate)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Flat-rate notes</dt>
                <dd
                  data-testid="vendor-flat-rate-notes"
                  className="whitespace-pre-line"
                >
                  {vendor.flat_rate_notes ?? "—"}
                </dd>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section
            className="border rounded-lg p-4 space-y-3"
            data-testid="notes-section"
          >
            <h2 className="text-sm font-medium">Notes</h2>
            <p
              data-testid="vendor-notes"
              className="text-sm text-muted-foreground whitespace-pre-line"
            >
              {vendor.notes ?? "No notes yet."}
            </p>
          </section>
        </>
      )}
    </main>
  );
}
