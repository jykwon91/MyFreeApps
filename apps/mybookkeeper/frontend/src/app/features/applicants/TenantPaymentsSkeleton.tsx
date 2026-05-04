import Skeleton from "@/shared/components/ui/Skeleton";

export default function TenantPaymentsSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-5 w-32" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
