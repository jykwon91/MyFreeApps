import Skeleton from "@/shared/components/ui/Skeleton";
import { REPLY_TEMPLATE_MESSAGES } from "@/shared/lib/reply-template-messages";
import { REPLY_TEMPLATE_PICKER_SKELETON_ROWS } from "@/shared/lib/reply-template-constants";

/** Mirrors ReplyTemplatePicker's cards while the templates load. */
export default function ReplyTemplatePickerSkeleton() {
  return (
    <div role="status" aria-busy="true" data-testid="reply-template-picker-skeleton">
      <span className="sr-only">{REPLY_TEMPLATE_MESSAGES.loadingActive}</span>
      <div aria-hidden="true" className="space-y-2 p-3">
        {REPLY_TEMPLATE_PICKER_SKELETON_ROWS.map((row) => (
          <div key={row} className="px-4 py-3 border rounded-lg min-h-[64px] space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
