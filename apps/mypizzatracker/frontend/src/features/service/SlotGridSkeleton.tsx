import { Card, Skeleton } from "@platform/ui";
import SlotGrid from "@/features/service/SlotGrid";

const PLACEHOLDER_COLUMNS = [0, 1, 2, 3];

export default function SlotGridSkeleton() {
  return (
    <SlotGrid>
      {PLACEHOLDER_COLUMNS.map((i) => (
        <Card key={i}>
          <Skeleton className="h-5 w-24 mb-3" />
          <Skeleton className="h-20 w-full mb-2" />
          <Skeleton className="h-20 w-full" />
        </Card>
      ))}
    </SlotGrid>
  );
}
