import {
  BIS_LIST_FRAGMENT_KEY,
  BIS_LIST_FRAGMENT_VERSION,
  MAX_BIS_LIST_FRAGMENT_LENGTH,
  UNNAMED_BIS_LIST,
} from "@/games/wow-forever/data/bisLists/bisListConfig";
import { DEFAULT_BIS_LIST_PHASE, isBisListPhase } from "@/games/wow-forever/data/bisLists/bisListPhases";
import { BIS_SLOTS } from "@/games/wow-forever/data/bisLists/bisSlots";
import { findClass, findSpec, firstSpec } from "@/games/wow-forever/data/classes";
import { cleanBisListName } from "@/games/wow-forever/lib/bisLists/bisListName";
import { parseBisListItems } from "@/games/wow-forever/lib/bisLists/parseBisListItems";
import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";

/*
 * Share-link fragment, version 1:
 *
 *   #list=1~<class>~<spec>~<phase>~<slot>:<item id>,<slot>:<item id>…~<name>
 *   #list=1~warlock~affliction~preraid~head:10504,neck:18691~Pre-raid%20Affliction
 *
 * Fields are split on "~"; the name is last and percent-encoded (including
 * "~"), so it can hold any text. Only filled rows are listed, in character-
 * sheet order. Nothing here ever goes to a server.
 */

const SEPARATOR = "~";
const FIELD_COUNT = 6;
const PREFIX = `${BIS_LIST_FRAGMENT_KEY}=`;
const ENCODED_SEPARATOR = /(%7e)/i;
const ROW_SEPARATOR = ":";
/** Characters encodeURIComponent leaves alone that would break the split or a chat app's link detection. */
const EXTRA_ESCAPES = /[~!'()*]/g;

function encodeName(name: string): string {
  return encodeURIComponent(name).replace(EXTRA_ESCAPES, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function decodeName(raw: string): string {
  try {
    return cleanBisListName(decodeURIComponent(raw), UNNAMED_BIS_LIST);
  } catch {
    return UNNAMED_BIS_LIST;
  }
}

/**
 * The six fields. Some apps percent-encode a pasted link's "~": then the
 * first five "%7E" are the separators and any later one belongs to the name.
 */
function splitFields(value: string): string[] {
  if (value.includes(SEPARATOR)) return value.split(SEPARATOR);
  // Captured, so the parts alternate field, separator, field, …
  const parts = value.split(ENCODED_SEPARATOR);
  const nameStart = (FIELD_COUNT - 1) * 2;
  const isField = (_: string, i: number) => i % 2 === 0;
  if (parts.length <= nameStart) return parts.filter(isField);
  return [...parts.slice(0, nameStart).filter(isField), parts.slice(nameStart).join("")];
}

/**
 * Nothing before the name holds "%" in a link we made, so a "%" there means
 * an app encoded the whole link (":" "," and the name's own "%" too, though
 * encodeURIComponent keeps "~"): undo that one layer in every field.
 */
function unescapeFields(fields: string[]): string[] | null {
  if (!fields.slice(0, -1).some((field) => field.includes("%"))) return fields;
  try {
    return fields.map((field) => decodeURIComponent(field));
  } catch {
    return null;
  }
}

/** `list=1~…` (no "#"), ready for a URL's fragment. */
export function encodeBisListFragment(list: SharedBisList): string {
  const rows = BIS_SLOTS.flatMap(({ id }) => {
    const itemId = list.items[id];
    return itemId === undefined ? [] : [`${id}:${itemId}`];
  });
  const fields = [BIS_LIST_FRAGMENT_VERSION, list.classId, list.specId, list.phase, rows.join(","), encodeName(list.name)];
  return `${PREFIX}${fields.join(SEPARATOR)}`;
}

/** True when the URL's fragment is a share link at all (valid or not). */
export function isBisListFragment(hash: string): boolean {
  return hash.replace(/^#/, "").startsWith(PREFIX);
}

/**
 * The list a fragment describes, or null when it isn't a version-1 list for
 * a known class. Never trusted: oversized input is refused unread, an unknown
 * spec becomes the class's first, an unknown phase the default, and unknown
 * rows or malformed ids are ignored. Item ids are checked against the item
 * list separately (`checkSharedList`).
 */
export function decodeBisListFragment(hash: string): SharedBisList | null {
  const fragment = hash.replace(/^#/, "");
  if (fragment.length > MAX_BIS_LIST_FRAGMENT_LENGTH || !fragment.startsWith(PREFIX)) return null;
  const fields = unescapeFields(splitFields(fragment.slice(PREFIX.length)));
  if (!fields || fields.length !== FIELD_COUNT) return null;
  const [version, classRaw, specRaw, phaseRaw, rowsRaw, nameRaw] = fields;
  if (version !== BIS_LIST_FRAGMENT_VERSION) return null;
  const cls = findClass(classRaw);
  if (!cls) return null;
  const rows = rowsRaw === "" ? [] : rowsRaw.split(",").slice(0, BIS_SLOTS.length);
  const entries = rows.flatMap((row): [string, string][] => {
    const parts = row.split(ROW_SEPARATOR);
    return parts.length === 2 ? [[parts[0], parts[1]]] : [];
  });
  return {
    name: decodeName(nameRaw),
    classId: cls.id,
    specId: findSpec(cls.id, specRaw) ? specRaw : firstSpec(cls.id),
    phase: isBisListPhase(phaseRaw) ? phaseRaw : DEFAULT_BIS_LIST_PHASE,
    items: parseBisListItems(entries),
  };
}
