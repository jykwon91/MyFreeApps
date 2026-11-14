import { File, Paths } from "expo-file-system";
import { SAVED_WORKSPACE_FILE } from "../../constants/workspace";
import { signedInEmail } from "../../lib/signedInEmail";
import type { SavedWorkspace } from "../../types/SavedWorkspace";
import type { SavedWorkspaceFile } from "../../types/SavedWorkspaceFile";

function savedFile(): File {
  return new File(Paths.document, SAVED_WORKSPACE_FILE);
}

/** The workspace this person last picked on this phone. Someone else's choice, or an unreadable file, is none. */
export function readSavedWorkspace(): SavedWorkspace | null {
  try {
    const owner = signedInEmail();
    const file = savedFile();
    if (!owner || !file.exists) return null;
    const saved = JSON.parse(file.textSync()) as SavedWorkspaceFile;
    if (saved.owner !== owner || typeof saved.workspaceId !== "string" || typeof saved.workspaceName !== "string") return null;
    return { id: saved.workspaceId, name: saved.workspaceName };
  } catch {
    return null;
  }
}

/** Best effort: a choice that can't be saved still holds until the app is closed. */
export function saveWorkspace(workspace: SavedWorkspace): void {
  const owner = signedInEmail();
  if (!owner) return;
  try {
    const file = savedFile();
    if (!file.exists) file.create();
    const saved: SavedWorkspaceFile = { owner, workspaceId: workspace.id, workspaceName: workspace.name };
    file.write(JSON.stringify(saved));
  } catch (error) {
    console.warn("Couldn't save the chosen workspace", error);
  }
}

export function clearSavedWorkspace(): void {
  const file = savedFile();
  if (file.exists) file.delete();
}
