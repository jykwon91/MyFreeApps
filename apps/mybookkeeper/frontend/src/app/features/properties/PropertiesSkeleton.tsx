import Skeleton from "@/shared/components/ui/Skeleton";

export default function PropertiesSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="border rounded-lg p-4 flex items-center justify-between">
          <div className="space-y-1.5">
            {/* name + optional classification badge row */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
            {/* address */}
            <Skeleton className="h-3 w-56" />
            {/* classification · rental type */}
            <Skeleton className="h-3 w-40" />
          </div>
          {/* action buttons: deactivate + edit + delete */}
          <div className="flex items-center gap-1">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}
