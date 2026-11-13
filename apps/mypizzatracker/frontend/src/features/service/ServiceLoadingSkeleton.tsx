import { Skeleton } from "@platform/ui";
import ServiceFrame from "@/features/service/ServiceFrame";
import ServiceHeader from "@/features/service/ServiceHeader";
import SlotGridSkeleton from "@/features/service/SlotGridSkeleton";

/**
 * The service page while the drops load. The drop picker is left out on
 * purpose: it only shows with more than one active drop, which isn't known
 * until they load.
 */
export default function ServiceLoadingSkeleton() {
  return (
    <ServiceFrame>
      <ServiceHeader
        title={<Skeleton className="h-8 w-48" />}
        subtitle={<Skeleton className="h-5 w-40" />}
      />
      <SlotGridSkeleton />
    </ServiceFrame>
  );
}
