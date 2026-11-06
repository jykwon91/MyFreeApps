import { VOTER_ID_STORAGE_KEY } from "@/games/wow-forever/data/featureRequests/suggestStorageKeys";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Kept for the page's life when storage is blocked, so votes in this visit still toggle.
let memoryVoterId: string | null = null;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** A random v4 UUID. `crypto.randomUUID` only exists on secure origins, so build one by hand elsewhere. */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * This browser's anonymous voter id: a random UUID made on first use and kept in localStorage.
 * It identifies nobody — the server keeps only an HMAC of it per story, so a vote can be toggled.
 */
export function getVoterId(): string {
  const stored = readStored(VOTER_ID_STORAGE_KEY, (raw) => (isUuid(raw) ? raw : null), null);
  if (stored !== null) return stored;
  if (memoryVoterId === null) memoryVoterId = randomUuid();
  writeStored(VOTER_ID_STORAGE_KEY, memoryVoterId);
  return memoryVoterId;
}
