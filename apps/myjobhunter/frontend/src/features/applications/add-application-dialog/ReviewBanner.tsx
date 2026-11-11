import type { ReviewBannerProps } from "@/types/application/review-banner-props";

/** The green "review before saving" banner, with the read summary and its source. */
export default function ReviewBanner({ sourceUrl, summary }: ReviewBannerProps) {
  return (
    <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3">
      <p className="text-sm font-medium text-green-800 dark:text-green-300">
        Review and adjust before saving
      </p>
      {summary ? (
        <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 line-clamp-2">
          {summary}
        </p>
      ) : null}
      {sourceUrl ? (
        <p className="text-xs text-muted-foreground mt-1 truncate">
          Source: <span className="underline">{sourceUrl}</span>
        </p>
      ) : null}
    </div>
  );
}
