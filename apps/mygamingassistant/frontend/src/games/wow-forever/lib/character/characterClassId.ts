import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";

/** Blizzard's class name ("Warlock") as MGA's class id; undefined for a class MGA doesn't know. */
export function characterClassId(className: string): WowClassId | undefined {
  return findClass(className.trim().toLowerCase())?.id;
}
