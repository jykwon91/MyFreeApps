import { Card, Skeleton } from "@platform/ui";

export default function DropsListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </Card>
      ))}
    </div>
  );
}
