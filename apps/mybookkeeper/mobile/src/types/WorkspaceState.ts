import type { SavedWorkspace } from "./SavedWorkspace";

export interface WorkspaceState {
  activeId: string | null;
  /** Set when someone lost the workspace they were in and was moved to another. */
  lostWorkspace: { from: string; to: string } | null;
  /**
   * Set while the workspace list can't be reached and the one open is the one saved on this phone,
   * so the app works offline. Cleared as soon as a workspace is chosen from the loaded list.
   */
  remembered: SavedWorkspace | null;
}
