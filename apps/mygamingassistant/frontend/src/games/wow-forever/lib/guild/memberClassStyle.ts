import type { CSSProperties } from "react";
import { CLASS_COLORS } from "@/games/wow-forever/data/guild/classColors";
import { characterClassId } from "@/games/wow-forever/lib/character/characterClassId";

/** The CSS variables ``CLASS_NAME_TEXT`` reads for a member's class colour; undefined (plain text) for an unknown class. */
export function memberClassStyle(className: string | null): CSSProperties | undefined {
  const classId = className ? characterClassId(className) : undefined;
  if (!classId) return undefined;
  const color = CLASS_COLORS[classId];
  return { "--c-light": color.light, "--c-dark": color.dark } as CSSProperties;
}
