import Skeleton from "@/shared/components/ui/Skeleton";
import { REPLY_TEMPLATE_MESSAGES } from "@/shared/lib/reply-template-messages";

/** Mirrors RenderedReplyEditor while a picked template is filled in. */
export default function RenderedReplyEditorSkeleton() {
  return (
    <div role="status" aria-busy="true" data-testid="reply-render-loading">
      <span className="sr-only">{REPLY_TEMPLATE_MESSAGES.fillingIn}</span>
      <div aria-hidden="true" className="space-y-3">
        <div>
          <Skeleton className="h-3 w-16 mb-1" />
          <Skeleton className="h-11 w-full" />
        </div>
        <div>
          <Skeleton className="h-3 w-20 mb-1" />
          <Skeleton className="h-[200px] w-full" />
        </div>
      </div>
    </div>
  );
}
