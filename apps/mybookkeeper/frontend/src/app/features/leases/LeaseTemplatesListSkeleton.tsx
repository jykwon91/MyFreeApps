import Skeleton from "@/shared/components/ui/Skeleton";

export default function LeaseTemplatesListSkeleton() {
  return (
    <ul className="space-y-3" data-testid="lease-templates-skeleton">
      {[0, 1, 2].map((n) => (
        <li
          key={n}
          className="border rounded-lg p-4 space-y-2"
        >
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/4" />
        </li>
      ))}
    </ul>
  );
}
