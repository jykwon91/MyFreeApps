import type { WarlockMacro } from "@/games/wow-forever/types/warlockMacro";
import type { WarlockNames } from "@/games/wow-forever/types/warlockNames";

/** The game's limit on one macro's text. */
export const MACRO_MAX_LENGTH = 255;

const COMMAND_LINE = /^\/(cast|use|castsequence)\s+(.*)$/;
const KEEP_ON_PREFIX = /^!/;
const CONDITIONS = /^(\[[^\]]*\]\s*)+/;
const SEQUENCE_RESET = /^reset=\S+\s*/;

/** The spell and item names a macro's text casts or uses, in order. */
export function namesInText(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split("\n")) {
    const match = COMMAND_LINE.exec(line.trim());
    if (!match) continue;
    const [, command, rest] = match;
    const body = command === "castsequence" ? rest.replace(SEQUENCE_RESET, "") : rest;
    // A /castsequence lists spells with commas; /cast and /use pick one clause per ";".
    const clauses = body.split(command === "castsequence" ? "," : ";");
    names.push(
      ...clauses.map((c) => c.trim().replace(CONDITIONS, "").replace(KEEP_ON_PREFIX, "").trim()).filter((p) => p !== ""),
    );
  }
  return names;
}

/** Names a macro lists that the Forever client doesn't have. Empty means every one is confirmed. */
export function missingNames(macro: WarlockMacro, names: WarlockNames): string[] {
  const spells = new Set([...names.spells, ...names.petSpells, ...names.generalSpells]);
  const items = new Set([...names.items, ...names.potions]);
  return [
    ...macro.spells.filter((s) => !spells.has(s)),
    ...macro.items.filter((i) => !items.has(i)),
  ];
}
