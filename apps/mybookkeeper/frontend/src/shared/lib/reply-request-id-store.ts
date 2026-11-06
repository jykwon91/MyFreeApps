import type { ReplyRequestIdStore } from "@mybookkeeper/api-client/types/inquiry/reply-request-id-store";

const PREFIX = "mbk.replyRequestId.";
// Used only when the browser refuses session storage (blocked or full); ids then last until the tab reloads.
const inMemory = new Map<string, string>();

/** Session storage, so an unconfirmed reply keeps its id through closing the panel or reloading the tab. */
export const replyRequestIdStore: ReplyRequestIdStore = {
  get: (key) => {
    try {
      return sessionStorage.getItem(PREFIX + key) ?? inMemory.get(key) ?? null;
    } catch {
      return inMemory.get(key) ?? null;
    }
  },
  set: (key, id) => {
    inMemory.set(key, id);
    try {
      sessionStorage.setItem(PREFIX + key, id);
    } catch {
      // Kept in memory above.
    }
  },
  deleteStartingWith: (prefix) => {
    [...inMemory.keys()].filter((key) => key.startsWith(prefix)).forEach((key) => inMemory.delete(key));
    try {
      const stored = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index));
      stored
        .filter((key): key is string => key !== null && key.startsWith(PREFIX + prefix))
        .forEach((key) => sessionStorage.removeItem(key));
    } catch {
      // Nothing stored there.
    }
  },
  delete: (key) => {
    inMemory.delete(key);
    try {
      sessionStorage.removeItem(PREFIX + key);
    } catch {
      // Nothing stored there.
    }
  },
};
