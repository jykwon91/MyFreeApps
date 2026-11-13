export interface CreateWorkspaceSheetProps {
  onClose: () => void;
  /** Creates it with the trimmed name. Resolves to the problem to show here, or null if the sheet can close. */
  onCreate: (name: string) => Promise<string | null>;
}
