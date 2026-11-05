export interface WorkspaceState {
  activeId: string | null;
  /** Set when someone lost the workspace they were in and was moved to another. */
  lostWorkspace: { from: string; to: string } | null;
}
