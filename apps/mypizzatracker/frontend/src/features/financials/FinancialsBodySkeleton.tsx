import { Skeleton } from "@platform/ui";
import FinancialsSection from "@/features/financials/FinancialsSection";
import FinancialsStack from "@/features/financials/FinancialsStack";

/** Placeholders for the summary and expenses sections. */
export default function FinancialsBodySkeleton() {
  return (
    <FinancialsStack>
      <FinancialsSection>
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-28 w-full" />
      </FinancialsSection>
      <FinancialsSection>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-10 w-full" />
      </FinancialsSection>
    </FinancialsStack>
  );
}
