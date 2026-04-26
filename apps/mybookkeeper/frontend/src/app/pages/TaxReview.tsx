import { useSearchParams, Link } from "react-router-dom";
import { getYear } from "date-fns";
import { FileText } from "lucide-react";
import { useGetTaxCompletenessQuery } from "@/shared/store/taxCompletenessApi";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import Button from "@/shared/components/ui/Button";
import ReviewSummary from "@/app/features/tax-review/ReviewSummary";
import FormCompletenessCard from "@/app/features/tax-review/FormCompletenessCard";
import TaxReviewSkeleton from "@/app/features/tax-review/TaxReviewSkeleton";

const CURRENT_YEAR = getYear(new Date());

export default function TaxReview() {
  const [searchParams] = useSearchParams();
  const yearParam = searchParams.get("year");
  const taxYear = yearParam ? Number(yearParam) : CURRENT_YEAR;

  const { data, isLoading, isError } = useGetTaxCompletenessQuery({ taxYear });

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Here's what I found"
        subtitle={`Tax year ${taxYear}`}
      />

      {isLoading ? (
        <TaxReviewSkeleton />
      ) : isError ? (
        <div className="max-w-3xl mx-auto text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium mb-1">
            I wasn't able to load your tax summary.
          </p>
          <p className="text-sm">Try refreshing the page. If the problem persists, check back later.</p>
        </div>
      ) : !data || data.forms.length === 0 ? (
        <div className="max-w-3xl mx-auto text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium mb-1">Nothing to review yet</p>
          <p className="text-sm">
            I haven't found any tax documents for {taxYear}. Upload some documents and I'll summarize what I find.
          </p>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-6">
          <ReviewSummary summary={data.summary} />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Forms
            </h2>
            {data.forms.map((form, i) => (
              <FormCompletenessCard
                key={`${form.form_name}-${form.instance_label ?? i}`}
                form={form}
              />
            ))}
          </section>

          <div className="flex items-center justify-between gap-4 pt-2 border-t">
            <Link
              to="/tax-returns"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <FileText className="h-4 w-4" />
              View Full Tax Return
            </Link>
            <Button variant="primary" size="sm">
              Looks good
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
