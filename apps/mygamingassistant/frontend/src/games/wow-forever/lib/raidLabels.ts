/** The raid page's words, matching the Discord post's (`raid_embed`, `raid_text.seats_detail`). */
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import type { RaidEntry, RaidPage } from "@/games/wow-forever/types/raid";

/** "14/40 confirmed (2 late) · 3 in queue" — the post's sign-up line. */
export function seatsLabel(page: Pick<RaidPage, "seats_taken" | "size_cap" | "late" | "queued">): string {
  let label = `${page.seats_taken}/${page.size_cap} confirmed`;
  if (page.late > 0) label += ` (${page.late} late)`;
  if (page.queued > 0) label += ` · ${page.queued} in queue`;
  return label;
}

/** "6", or "2/2" against a limit. */
export function countLabel(count: number, limit: number | null): string {
  if (limit === null) return String(count);
  return `${count}/${limit}`;
}

/** Under the title: the raid, when the leader named it something else, and who leads it. */
export function raidSubtitle(page: Pick<RaidPage, "title" | "raid_name" | "leader_name">): string {
  const parts: string[] = [];
  if (page.title !== page.raid_name) parts.push(page.raid_name);
  if (page.leader_name) parts.push(`Leader: ${page.leader_name}`);
  return parts.join(" · ");
}

/** An entry icon's alt: the spec ("Fury Warrior"), else the class, else nothing. */
export function entryIconAlt(entry: Pick<RaidEntry, "spec" | "wow_class">): string {
  if (entry.spec) return entry.spec;
  const wowClass = WOW_CLASSES.find((candidate) => candidate.id === entry.wow_class);
  if (wowClass) return wowClass.name;
  return "";
}
