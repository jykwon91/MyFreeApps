import { useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { showError } from "@/shared/lib/toast-store";
import { useReorderSectionsMutation } from "@/shared/store/welcomeManualsApi";
import type { WelcomeManualSectionResponse } from "@/shared/types/welcome-manual/welcome-manual-section-response";

export interface UseWelcomeManualSectionOrderArgs {
  manualId: string;
  sections: readonly WelcomeManualSectionResponse[];
}

export interface UseWelcomeManualSectionOrderResult {
  /** Section ids in their current (possibly optimistic) display order. */
  orderedIds: string[];
  handleDragEnd: (event: DragEndEvent) => Promise<void>;
}

/**
 * Section-order optimistic state. Mirrors ListingPhotoManager's `orderedIds`
 * pattern so the order doesn't snap back mid-drag: local state updates
 * immediately, the full permutation is persisted via `PUT .../sections/order`,
 * and the `WelcomeManual` tag is invalidated by the mutation so the manual
 * refetches with `images` intact (the order endpoint returns `images: []` by
 * design — see welcomeManualsApi). On error we revert to the server order.
 */
export function useWelcomeManualSectionOrder({
  manualId,
  sections,
}: UseWelcomeManualSectionOrderArgs): UseWelcomeManualSectionOrderResult {
  const [reorderSections] = useReorderSectionsMutation();
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const sortedIds = [...sections]
    .sort((a, b) => a.display_order - b.display_order)
    .map((s) => s.id);
  const orderedIds = localOrder ?? sortedIds;

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(orderedIds, oldIndex, newIndex);
    setLocalOrder(newOrder);

    try {
      await reorderSections({ manualId, sectionIds: newOrder }).unwrap();
      // Let the refetched manual (from tag invalidation) re-drive the order.
      setLocalOrder(null);
    } catch {
      showError("I couldn't save the new order. Reverting.");
      setLocalOrder(null);
    }
  }

  return { orderedIds, handleDragEnd };
}
