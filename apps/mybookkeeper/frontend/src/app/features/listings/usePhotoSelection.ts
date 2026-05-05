import { useState, useCallback } from "react";
import type { PhotoSelection } from "@/shared/types/listing/photo-selection";

export interface UsePhotoSelectionReturn {
  selection: PhotoSelection;
  toggleSelection: (photoId: string, shiftKey: boolean, orderedIds: string[]) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  isSelected: (photoId: string) => boolean;
}

export function usePhotoSelection(): UsePhotoSelectionReturn {
  const [selection, setSelection] = useState<PhotoSelection>({
    selectedIds: new Set(),
    lastSelectedId: null,
  });

  const toggleSelection = useCallback(
    (photoId: string, shiftKey: boolean, orderedIds: string[]) => {
      setSelection((prev) => {
        if (shiftKey && prev.lastSelectedId) {
          const anchorIndex = orderedIds.indexOf(prev.lastSelectedId);
          const targetIndex = orderedIds.indexOf(photoId);
          if (anchorIndex === -1 || targetIndex === -1) {
            // Fallback: just toggle the single photo
            const next = new Set(prev.selectedIds);
            if (next.has(photoId)) {
              next.delete(photoId);
            } else {
              next.add(photoId);
            }
            return { selectedIds: next, lastSelectedId: photoId };
          }
          const start = Math.min(anchorIndex, targetIndex);
          const end = Math.max(anchorIndex, targetIndex);
          const rangeIds = orderedIds.slice(start, end + 1);
          const next = new Set(prev.selectedIds);
          for (const id of rangeIds) {
            next.add(id);
          }
          return { selectedIds: next, lastSelectedId: photoId };
        }

        const next = new Set(prev.selectedIds);
        if (next.has(photoId)) {
          next.delete(photoId);
        } else {
          next.add(photoId);
        }
        return { selectedIds: next, lastSelectedId: photoId };
      });
    },
    [],
  );

  const selectAll = useCallback((ids: string[]) => {
    setSelection({ selectedIds: new Set(ids), lastSelectedId: ids[ids.length - 1] ?? null });
  }, []);

  const clearSelection = useCallback(() => {
    setSelection({ selectedIds: new Set(), lastSelectedId: null });
  }, []);

  const isSelected = useCallback(
    (photoId: string) => selection.selectedIds.has(photoId),
    [selection.selectedIds],
  );

  return { selection, toggleSelection, selectAll, clearSelection, isSelected };
}
