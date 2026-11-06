import type { ReplyRequestIdStore } from "@mybookkeeper/api-client/types/inquiry/reply-request-id-store";
import { File, Paths } from "expo-file-system";
import { REPLY_REQUEST_ID_FILE } from "../../constants/replies";
import { signedInEmail } from "../../lib/signedInEmail";

/**
 * In documents, not the cache the system may empty: losing an id would let a retry
 * email twice. It holds no message text, only ids and hashes. Held in memory too,
 * so a file that can't be written still protects this run.
 */
let loaded: { owner: string | null; ids: Map<string, string> } | null = null;

function idsFile(): File {
  return new File(Paths.document, REPLY_REQUEST_ID_FILE);
}

function readSaved(owner: string): Map<string, string> {
  const file = idsFile();
  if (!file.exists) return new Map();
  try {
    const saved = JSON.parse(file.textSync()) as { owner?: unknown; ids?: unknown };
    if (saved.owner !== owner || typeof saved.ids !== "object" || saved.ids === null) return new Map();
    return new Map(Object.entries(saved.ids).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    // Unreadable means nothing to reuse. It gets replaced at the next send.
    return new Map();
  }
}

function currentIds(): Map<string, string> {
  const owner = signedInEmail();
  if (!loaded || loaded.owner !== owner) loaded = { owner, ids: owner ? readSaved(owner) : new Map() };
  return loaded.ids;
}

function persist(): void {
  if (!loaded?.owner) return;
  try {
    const file = idsFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify({ owner: loaded.owner, ids: Object.fromEntries(loaded.ids) }));
  } catch (error) {
    // The ids in memory still hold until the app is closed.
    console.warn("Couldn't save reply request ids", error);
  }
}

export const replyRequestIds: ReplyRequestIdStore = {
  get: (key) => currentIds().get(key) ?? null,
  set: (key, id) => {
    currentIds().set(key, id);
    persist();
  },
  delete: (key) => {
    if (currentIds().delete(key)) persist();
  },
  deleteStartingWith: (prefix) => {
    const ids = currentIds();
    const matching = [...ids.keys()].filter((key) => key.startsWith(prefix));
    matching.forEach((key) => ids.delete(key));
    if (matching.length > 0) persist();
  },
};

export function clearReplyRequestIds(): void {
  loaded = null;
  const file = idsFile();
  if (file.exists) file.delete();
}
