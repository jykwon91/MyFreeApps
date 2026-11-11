import iconsJson from "@/games/wow-forever/data/icons/wowIcons.json";

const ITEMS = iconsJson.items as unknown as Record<string, readonly number[]>;
const SPELLS = iconsJson.spells as unknown as Record<string, number>;

/** The icon file id wowIcons.json holds for an item — what the item's row must point at. */
export function itemIconFile(itemId: number): number {
  const entry = ITEMS[String(itemId)];
  if (!entry) throw new Error(`no icon for item ${itemId}`);
  return entry[0];
}

/** The icon file id wowIcons.json holds for a spell. */
export function spellIconFile(spellId: number): number {
  const file = SPELLS[String(spellId)];
  if (file === undefined) throw new Error(`no icon for spell ${spellId}`);
  return file;
}

/** The `src` of each game icon an element holds, in order. */
export function iconSources(root: HTMLElement | Document = document): string[] {
  return [...root.querySelectorAll("[data-testid=game-icon]")].map((el) => el.getAttribute("src") ?? "");
}
