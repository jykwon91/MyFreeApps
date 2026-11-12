import { formatWhole } from "@/games/wow-forever/lib/character/formatWhole";

/** "1 faction" / "1,204 factions": the number with the right noun. */
export function formatCount(count: number, one: string, many: string): string {
  const noun = count === 1 ? one : many;
  return `${formatWhole(count)} ${noun}`;
}
