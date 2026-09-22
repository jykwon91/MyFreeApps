import { useCallback, useState } from "react";
import { newCompareItem } from "@/games/wow-forever/lib/newCompareItem";
import type { CompareItem } from "@/games/wow-forever/types/compareItem";

export const MIN_COMPARE_ITEMS = 2;
export const MAX_COMPARE_ITEMS = 6;

function defaultItems(): CompareItem[] {
  return [newCompareItem("Item 1"), newCompareItem("Item 2")];
}

/** The items on the compare page. Page state only — never persisted or sent anywhere. */
export function useCompareItems(): {
  items: CompareItem[];
  addItem: () => void;
  removeItem: (id: string) => void;
  replaceItem: (item: CompareItem) => void;
  canAdd: boolean;
  canRemove: boolean;
} {
  const [items, setItems] = useState<CompareItem[]>(defaultItems);

  const addItem = useCallback(() => {
    setItems((prev) => {
      if (prev.length >= MAX_COMPARE_ITEMS) return prev;
      return [...prev, newCompareItem(`Item ${prev.length + 1}`)];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      if (prev.length <= MIN_COMPARE_ITEMS) return prev;
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const replaceItem = useCallback((item: CompareItem) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
  }, []);

  return {
    items,
    addItem,
    removeItem,
    replaceItem,
    canAdd: items.length < MAX_COMPARE_ITEMS,
    canRemove: items.length > MIN_COMPARE_ITEMS,
  };
}
