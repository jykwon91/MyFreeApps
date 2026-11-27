import { Skeleton } from "@platform/ui";

/** Holds the place of ``CashBasisNote`` while the page loads. */
export default function CashBasisNoteSkeleton() {
  return <Skeleton className="h-4 w-full max-w-2xl" testId="cash-basis-note-skeleton" />;
}
