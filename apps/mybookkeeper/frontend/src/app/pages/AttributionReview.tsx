import SectionHeader from "@/shared/components/ui/SectionHeader";
import AttributionReviewPanel from "@/app/features/attribution/AttributionReviewPanel";

export default function AttributionReview() {
  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Payment Review"
        subtitle="Review unmatched or fuzzy-matched rent payments and link them to your tenants."
      />
      <AttributionReviewPanel />
    </main>
  );
}
