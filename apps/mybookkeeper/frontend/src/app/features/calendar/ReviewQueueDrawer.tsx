import { useState } from "react";
import { X } from "lucide-react";
import ReviewQueueItem from "@/app/features/calendar/ReviewQueueItem";
import ReviewQueueSkeleton from "@/app/features/calendar/ReviewQueueSkeleton";
import EmptyState from "@/shared/components/ui/EmptyState";
import { useGetReviewQueueQuery } from "@/shared/store/calendarApi";

export interface ReviewQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Slide-over drawer that shows all pending booking review-queue items.
 *
 * Rendered lazily — the queue is only fetched when the drawer opens so we
 * don't add a background poll to every Calendar page render.
 */
export default function ReviewQueueDrawer({ isOpen, onClose }: ReviewQueueDrawerProps) {
  const { data: items, isLoading, isError } = useGetReviewQueueQuery(
    undefined,
    { skip: !isOpen },
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        aria-hidden="true"
        onClick={onClose}
        data-testid="review-queue-backdrop"
      />

      {/* Panel */}
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-xl dark:bg-gray-900"
        aria-label="Booking review queue"
        data-testid="review-queue-drawer"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">Booking review queue</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Emails from channels that need a one-time decision
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close review queue"
            className="rounded-md p-2 text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isError ? (
            <p className="text-sm text-destructive">
              I couldn't load the queue. Try closing and reopening the panel.
            </p>
          ) : isLoading ? (
            <ReviewQueueSkeleton />
          ) : !items || items.length === 0 ? (
            <EmptyState
              message="All clear — no bookings waiting for review."
              data-testid="review-queue-empty"
            />
          ) : (
            items.map((item) => (
              <ReviewQueueItem key={item.id} item={item} />
            ))
          )}
        </div>
      </aside>
    </>
  );
}
