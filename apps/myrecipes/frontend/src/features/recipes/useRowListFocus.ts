import { useEffect, useRef, useState, type RefObject } from "react";
import { RECIPE_ROW_ANNOUNCEMENTS } from "@myrecipes/api-client/constants/recipeRowAnnouncements";

type Pending = { kind: "add" } | { kind: "remove"; index: number };

interface RowListFocus {
  containerRef: RefObject<HTMLDivElement | null>;
  /** Said to screen readers after a row moves. */
  announcement: string;
  add: () => void;
  remove: (key: string, index: number) => void;
  move: (key: string, index: number, direction: -1 | 1) => void;
}

interface Options {
  noun: "ingredient" | "step";
  rowCount: number;
  /** The id of the list's Add button, which takes focus when the last row is removed. */
  addButtonId: string;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
}

/**
 * Keeps focus and announcements right as a list's rows change: a new row's first control takes
 * focus, a removed row hands focus to the next row (or the previous, or the Add button), and a
 * move is announced. Controls mark themselves with `data-row-first`.
 */
export function useRowListFocus({ noun, rowCount, addButtonId, onAdd, onRemove, onMove }: Options): RowListFocus {
  const containerRef = useRef<HTMLDivElement>(null);
  const pending = useRef<Pending | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const change = pending.current;
    if (!change) return;
    pending.current = null;
    const firsts = containerRef.current?.querySelectorAll<HTMLElement>("[data-row-first]") ?? [];
    if (change.kind === "add") {
      firsts[firsts.length - 1]?.focus();
      return;
    }
    const next = firsts[Math.min(change.index, firsts.length - 1)];
    (next ?? containerRef.current?.querySelector<HTMLElement>(`#${addButtonId}`))?.focus();
  }, [rowCount, addButtonId]);

  return {
    containerRef,
    announcement,
    add: () => {
      pending.current = { kind: "add" };
      onAdd();
    },
    remove: (key, index) => {
      pending.current = { kind: "remove", index };
      onRemove(key);
    },
    move: (key, index, direction) => {
      onMove(key, direction);
      setAnnouncement(RECIPE_ROW_ANNOUNCEMENTS.moved(noun, index + 1, direction, index + 1 + direction));
    },
  };
}
