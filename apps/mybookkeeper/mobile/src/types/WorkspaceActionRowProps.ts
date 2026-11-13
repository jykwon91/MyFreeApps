export interface WorkspaceActionRowProps {
  label: string;
  /** A second line, e.g. the workspace that's open. Read out with the label. */
  secondary?: string;
  hint: string;
  onPress: () => void;
}
