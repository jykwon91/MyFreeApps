import { MACRO_MAX_CHARS } from "@/games/wow-forever/data/rares/raresConfig";
import type { TargetMacro } from "@/games/wow-forever/types/rares/targetMacro";

/** The chat line that targets a creature by name: `/target Morgaine the Sly`. */
export function targetLine(name: string): string {
  return `/target ${name}`;
}

function macro(names: readonly string[]): TargetMacro {
  const text = names.map(targetLine).join("\n");
  return { text, length: text.length, names };
}

/**
 * `/target` lines for `names`, packed in order into as few macros as fit the
 * game's MACRO_MAX_CHARS each (a line break counts as one). Names repeated
 * are targeted once. A single line too long for a macro still gets its own.
 */
export function targetMacros(names: readonly string[], maxChars: number = MACRO_MAX_CHARS): TargetMacro[] {
  const unique = [...new Set(names)];
  const out: TargetMacro[] = [];
  let current: string[] = [];
  let length = 0;
  for (const name of unique) {
    const line = targetLine(name).length;
    const grown = current.length === 0 ? line : length + 1 + line;
    if (current.length > 0 && grown > maxChars) {
      out.push(macro(current));
      current = [name];
      length = line;
    } else {
      current.push(name);
      length = grown;
    }
  }
  if (current.length > 0) out.push(macro(current));
  return out;
}
