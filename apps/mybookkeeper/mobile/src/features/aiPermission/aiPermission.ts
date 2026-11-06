import { File, Paths } from "expo-file-system";
import { AI_PERMISSION_FILE, AI_PERMISSION_VERSION } from "../../constants/aiPermission";
import { signedInEmail } from "../../lib/signedInEmail";

const listeners = new Set<() => void>();

function permissionFile(): File {
  return new File(Paths.document, AI_PERMISSION_FILE);
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

/** Anything short of a saved yes, from this person, about what's sent today, is a no. */
export function hasAiPermission(): boolean {
  try {
    const owner = signedInEmail();
    const file = permissionFile();
    if (!owner || !file.exists) return false;
    const saved = JSON.parse(file.textSync()) as { owner?: unknown; version?: unknown };
    return saved.owner === owner && saved.version === AI_PERMISSION_VERSION;
  } catch {
    return false;
  }
}

/** Throws if it can't be saved: the caller has to say so, and nothing gets sent. */
export function allowAi(): void {
  const owner = signedInEmail();
  if (!owner) throw new Error("Nobody is signed in");
  const file = permissionFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify({ owner, version: AI_PERMISSION_VERSION }));
  notifyListeners();
}

/** Throws if the yes is still there: the caller has to say so, because sending would carry on. */
export function stopAi(): void {
  const file = permissionFile();
  if (file.exists) file.delete();
  notifyListeners();
}

export function subscribeToAiPermission(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
