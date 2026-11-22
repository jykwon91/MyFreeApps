import { AlertBox } from "@platform/ui";
import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";

interface UsageCheckFailedNoticeProps {
  onRetry: () => void;
}

/** Today's usage couldn't load: said quietly, with a retry, and the scenarios stay usable. */
export default function UsageCheckFailedNotice({ onRetry }: UsageCheckFailedNoticeProps) {
  return (
    <AlertBox variant="info">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span role="status">{CATALOG_COPY.usageUnavailable}</span>
        <button type="button" onClick={onRetry} className="min-h-[44px] rounded-md px-3 font-medium underline">
          {CATALOG_COPY.retry}
        </button>
      </div>
    </AlertBox>
  );
}
