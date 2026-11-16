import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { signedInEmail } from "@platform/mobile";
import { Directory, File, Paths } from "expo-file-system";
import { COOK_COPY_DIRECTORY, COOK_COPY_LIMIT } from "../../constants/cook";
import { session } from "../../lib/session";
import type { CookCopy } from "../../types/CookCopy";

// Documents, not the cache: the system may empty the cache just when there's no connection to refill it.
function copiesRoot(): Directory {
  return new Directory(Paths.document, COOK_COPY_DIRECTORY);
}

function copyFile(recipeId: string): File {
  return new File(copiesRoot(), `${encodeURIComponent(recipeId)}.json`);
}

function isVersion(version: unknown): version is VersionResponse {
  if (typeof version !== "object" || version === null) return false;
  const { id, ingredients, steps } = version as Partial<VersionResponse>;
  return typeof id === "string" && Array.isArray(ingredients) && Array.isArray(steps);
}

function readCopy(file: File): CookCopy | null {
  try {
    const copy = JSON.parse(file.textSync()) as Partial<CookCopy>;
    if (typeof copy.owner !== "string" || typeof copy.recipeId !== "string" || typeof copy.title !== "string") return null;
    if (typeof copy.savedAt !== "number" || !isVersion(copy.version)) return null;
    return copy as CookCopy;
  } catch {
    return null;
  }
}

function deleteFile(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // Left behind, it's replaced at the next save or cleared at sign-out.
  }
}

/** The copy saved when this person last cooked the recipe here. Someone else's, or an unreadable one, is none. */
export function loadCookCopy(recipeId: string): CookCopy | null {
  const owner = signedInEmail(session);
  if (!owner) return null;
  try {
    const file = copyFile(recipeId);
    if (!file.exists) return null;
    const copy = readCopy(file);
    return copy && copy.owner === owner && copy.recipeId === recipeId ? copy : null;
  } catch {
    return null;
  }
}

/** Best effort: failing to save mustn't get in the way of cooking, so it isn't reported. */
export function saveCookCopy(recipeId: string, title: string, version: VersionResponse): void {
  const owner = signedInEmail(session);
  if (!owner) return;
  try {
    copiesRoot().create({ idempotent: true, intermediates: true });
    const file = copyFile(recipeId);
    if (!file.exists) file.create();
    const copy: CookCopy = { owner, recipeId, title, version, savedAt: Date.now() };
    file.write(JSON.stringify(copy));
    evictOldest();
  } catch {
    // See above.
  }
}

function evictOldest(): void {
  const files = copiesRoot().list().filter((entry): entry is File => entry instanceof File);
  if (files.length <= COOK_COPY_LIMIT) return;
  const byAge = files.map((file) => ({ file, savedAt: readCopy(file)?.savedAt ?? 0 })).sort((a, b) => b.savedAt - a.savedAt);
  byAge.slice(COOK_COPY_LIMIT).forEach(({ file }) => deleteFile(file));
}

export function deleteCookCopy(recipeId: string): void {
  deleteFile(copyFile(recipeId));
}

export function clearCookCopies(): void {
  try {
    const root = copiesRoot();
    if (root.exists) root.delete();
  } catch {
    // Nothing useful to tell anyone at sign-out.
  }
}
