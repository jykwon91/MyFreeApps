import { WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";

/** The Changes feed's class filter, in `WOW_CLASSES` order. */
export const CHANGE_CLASS_IDS: readonly WowClassId[] = WOW_CLASSES.map((c) => c.id);

// Built from every class in `WOW_CLASSES`, so every id has a name.
export const CHANGE_CLASS_LABELS = Object.fromEntries(WOW_CLASSES.map((c) => [c.id, c.name])) as Readonly<
  Record<WowClassId, string>
>;
