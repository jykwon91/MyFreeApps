import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { changeLinkHref } from "@/games/wow-forever/lib/changes/changeLinkHref";
import { fileIcon, itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { changeProvenance } from "@/games/wow-forever/lib/provenance/changeProvenance";
import type { ChangeCategory } from "@/games/wow-forever/types/changes/changeCategory";
import type { ChangeEntry } from "@/games/wow-forever/types/changes/changeEntry";
import type { ChangeFileEntry } from "@/games/wow-forever/types/changes/changeFileEntry";
import type { ChangeIconRef } from "@/games/wow-forever/types/changes/changeIconRef";
import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";
import { normalizeText } from "@/games/wow-forever/worldMap/searchText";

function iconOf(ref: ChangeIconRef | undefined): WowIcon | null {
  if (!ref) return null;
  return ref[0] === "item" ? itemIcon(ref[1]) : fileIcon(ref[1]);
}

function classesOf(ids: readonly string[] | undefined): WowClassId[] {
  return (ids ?? []).flatMap((id) => findClass(id)?.id ?? []);
}

/** A stored row as the page shows it. A class id we don't know is dropped, never guessed. */
export function decodeChangeEntry(category: ChangeCategory, entry: ChangeFileEntry): ChangeEntry {
  return {
    key: entry.key,
    category,
    kind: entry.kind,
    name: entry.name,
    summary: entry.summary,
    rows: entry.rows ?? [],
    classes: classesOf(entry.classes),
    itemId: entry.link?.[0] === "item" ? entry.link[1] : null,
    href: entry.link ? changeLinkHref(entry.link) : null,
    icon: iconOf(entry.icon),
    provenance: changeProvenance(entry),
    since: entry.since,
    searchText: normalizeText(`${entry.name} ${entry.summary}`),
  };
}
