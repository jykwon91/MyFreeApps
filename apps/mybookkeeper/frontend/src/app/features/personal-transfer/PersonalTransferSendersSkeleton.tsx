import { Skeleton } from "@platform/ui";

const ROWS = 3;

export default function PersonalTransferSendersSkeleton() {
  return (
    <ul data-testid="personal-transfer-senders-skeleton" aria-busy="true" className="divide-y">
      {Array.from({ length: ROWS }, (_, i) => (
        <li key={i} className="flex items-center justify-between gap-3 py-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-28" />
        </li>
      ))}
    </ul>
  );
}
