import Skeleton from "@/shared/components/ui/Skeleton";
import { REPLY_TEMPLATE_SKELETON_ROWS } from "@/shared/lib/reply-template-constants";
import { REPLY_TEMPLATE_MESSAGES } from "@/shared/lib/reply-template-messages";

export interface ArchivedReplyTemplatesSkeletonProps {
  canWrite: boolean;
}

export default function ArchivedReplyTemplatesSkeleton({ canWrite }: ArchivedReplyTemplatesSkeletonProps) {
  return (
    <div className="space-y-3" role="status" aria-busy="true" data-testid="archived-reply-templates-skeleton">
      <span className="sr-only">{REPLY_TEMPLATE_MESSAGES.loadingArchived}</span>
      <Skeleton className="h-4 w-3/4" />
      <ul className="divide-y border rounded-md">
        {REPLY_TEMPLATE_SKELETON_ROWS.map((row) => (
          <li key={row} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2 sm:pr-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            {canWrite ? <Skeleton className="h-11 w-full sm:w-24" /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
