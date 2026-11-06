import { Card, Skeleton } from "@platform/ui";

export default function MenuSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((i) => (
        <Card key={i}>
          <Skeleton className="h-6 w-32 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-full" />
        </Card>
      ))}
    </div>
  );
}
