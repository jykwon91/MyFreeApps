import { DUPLICATE_PREFIX, MAX_BIS_LIST_NAME_LENGTH, UNNAMED_BIS_LIST } from "@/games/wow-forever/data/bisLists/bisListConfig";
import { cleanUserText } from "@/games/wow-forever/lib/cleanUserText";

/** A list name as stored and shown: hidden characters dropped, spaces collapsed, at most the max length. */
export function cleanBisListName(raw: string, fallback: string = UNNAMED_BIS_LIST): string {
  return cleanUserText(raw, MAX_BIS_LIST_NAME_LENGTH) || fallback;
}

/** "Copy of <name>", cut to the max length. */
export function duplicateBisListName(name: string): string {
  return cleanBisListName(`${DUPLICATE_PREFIX}${name}`);
}
