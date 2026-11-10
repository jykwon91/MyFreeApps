import Skeleton from "@/shared/components/ui/Skeleton";

export interface LeaseGenerateFormFieldsSkeletonProps {
  fieldCount: number;
}

/** Mirrors the loaded field grid: same columns, one label + input per field. */
export default function LeaseGenerateFormFieldsSkeleton({ fieldCount }: LeaseGenerateFormFieldsSkeletonProps) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
      data-testid="lease-generate-fields-skeleton"
    >
      {Array.from({ length: fieldCount }, (_, n) => (
        <div key={n} className="space-y-2" data-testid="lease-generate-field-skeleton">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
