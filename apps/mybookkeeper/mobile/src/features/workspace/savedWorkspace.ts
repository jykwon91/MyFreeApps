import { File, Paths } from "expo-file-system";
import { SAVED_WORKSPACE_FILE } from "../../constants/workspace";
import { signedInEmail } from "../../lib/signedInEmail";

function savedFile(): File {
  return new File(Paths.document, SAVED_WORKSPACE_FILE);
}

/** The workspace this person last picked on this phone. Someone else's choice, or an unreadable file, is none. */
export function readSavedWorkspaceId(): string | null {
  try {
    const owner = signedInEmail();
    const file = savedFile();
    if (!owner || !file.exists) return null;
    const saved = JSON.parse(file.textSync()) as { owner?: unknown; workspaceId?: unknown };
    return saved.owner === owner && typeof saved.workspaceId === "string" ? saved.workspaceId : null;
  } catch {
    return null;
  }
}

/** Best effort: a choice that can't be saved still holds until the app is closed. */
export function saveWorkspaceId(workspaceId: string): void {
  const owner = signedInEmail();
  if (!owner) return;
  try {
    const file = savedFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify({ owner, workspaceId }));
  } catch (error) {
    console.warn("Couldn't save the chosen workspace", error);
  }
}

export function clearSavedWorkspace(): void {
  const file = savedFile();
  if (file.exists) file.delete();
}
