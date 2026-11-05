import Skeleton from "@/shared/components/ui/Skeleton";
import { REPLY_TEMPLATE_SKELETON_ROWS } from "@/shared/lib/reply-template-constants";
import type { ReplyTemplatesSkeletonVariant } from "@/shared/types/inquiry/reply-templates-skeleton-variant";

export interface ReplyTemplatesSkeletonProps {
  variant: ReplyTemplatesSkeletonVariant;
  label: string;
  showActions: boolean;
}

export default function ReplyTemplatesSkeleton({ variant, label, showActions }: ReplyTemplatesSkeletonProps) {
  const archived = variant === "archived";
  return (
    <div className="space-y-3" role="status" aria-busy="true" data-testid={`${variant}-reply-templates-skeleton`}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-3">
        {archived ? <Skeleton className="h-4 w-3/4" /> : null}
        <ul className="divide-y border rounded-md">
          {REPLY_TEMPLATE_SKELETON_ROWS.map((row) => (
            <li
              key={row}
              className={
                archived
                  ? "flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                  : "flex items-center justify-between p-3"
              }
            >
              <div className={archived ? "min-w-0 flex-1 space-y-2 sm:pr-3" : "min-w-0 flex-1 space-y-2 pr-3"}>
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              {showActions && archived ? <Skeleton className="h-11 w-full sm:w-24" /> : null}
              {showActions && !archived ? (
                <div className="flex gap-1">
                  <Skeleton className="h-11 w-10 sm:h-8" />
                  <Skeleton className="h-11 w-10 sm:h-8" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
