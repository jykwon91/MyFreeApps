import type { WritTurnIn } from "@/games/wow-forever/types/writs/writTurnIn";
import type { WritTurnInSummary } from "@/games/wow-forever/types/writs/writTurnInSummary";

/** "2026-11-19" as the viewer's date. Read as UTC so the day never shifts with the time zone. */
export function formatSeenDate(seen: string): string {
  return new Date(`${seen}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC" });
}

/** The recorded turn-in to show: the player's faction's if there is one, else the first. Null = none recorded. */
export function summarizeTurnIn(records: readonly WritTurnIn[] | undefined, faction: WritTurnIn["faction"] | null): WritTurnInSummary | null {
  if (!records || records.length === 0) return null;
  const record = records.find((r) => r.faction === faction) ?? records[0];
  return { zone: record.zone, coords: `${record.x.toFixed(1)}, ${record.y.toFixed(1)}`, seenOn: formatSeenDate(record.seen) };
}
