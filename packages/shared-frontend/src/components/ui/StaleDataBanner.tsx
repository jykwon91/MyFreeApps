import type { StaleDataBannerProps } from "../../types/stale-data-banner-props";
import AlertBox from "./AlertBox";

/**
 * Shown above data that stays on screen after a refresh failed, so old data isn't mistaken
 * for current. The caller renders it only while there is data and an error.
 */
export default function StaleDataBanner({ message, onRetry, retryLabel, className = "" }: StaleDataBannerProps) {
  return (
    <AlertBox variant="warning" className={className}>
      <div className="flex items-center justify-between gap-3">
        <span role="status">{message}</span>
        {onRetry && retryLabel ? (
          <button type="button" onClick={onRetry} className="min-h-[44px] rounded-md px-3 font-medium underline">
            {retryLabel}
          </button>
        ) : null}
      </div>
    </AlertBox>
  );
}
