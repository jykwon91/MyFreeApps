import {
  MOB_NAME_MAX_LENGTH,
  SKULL_RAID_TARGET,
  TAG_DEFAULT_SPELL,
  TAG_MAX_MOBS,
  TAG_MOB_PLACEHOLDER,
} from "@/games/wow-forever/data/macros/tagMacro";
import type { TagMacroOptions } from "@/games/wow-forever/types/macros/tagMacroOptions";

/**
 * Pasted text → mob names: one per line (commas don't split, names can have
 * them), spaces tidied, brackets from a pasted link or quote dropped, repeats
 * removed, at most `TAG_MAX_MOBS`.
 */
export function parseMobNames(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const name = raw
      .replace(/^[\s"'[<(]+|[\s"'\]>)]+$/g, "")
      .replace(/\s+/g, " ")
      .slice(0, MOB_NAME_MAX_LENGTH)
      .trim();
    if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
    if (names.length === TAG_MAX_MOBS) break;
  }
  return names;
}

/**
 * Clears the target, targets each mob by its exact name (the last one that's
 * up wins), stops if none is up or it's dead, then casts. Nothing typed yet =
 * the placeholder name and Corruption, so the shape is still clear.
 */
export function buildTagMacro({ mobs, spell, skull }: TagMacroOptions): string {
  const cast = spell.trim() || TAG_DEFAULT_SPELL;
  const names = mobs.length > 0 ? mobs : [TAG_MOB_PLACEHOLDER];
  return [
    `#showtooltip ${cast}`,
    "/cleartarget",
    ...names.map((name) => `/targetexact ${name}`),
    "/stopmacro [noexists][dead]",
    ...(skull ? [`/script SetRaidTarget("target",${SKULL_RAID_TARGET})`] : []),
    `/cast ${cast}`,
  ].join("\n");
}
