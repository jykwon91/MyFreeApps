import Skeleton from "@/shared/components/ui/Skeleton";

export default function LeasesListSkeleton() {
  return (
    <ul className="space-y-3" data-testid="leases-skeleton">
      {[0, 1, 2, 3].map((n) => (
        <li
          key={n}
          className="border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 items-center"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-5 w-20" />
        </li>
      ))}
    </ul>
  );
}
