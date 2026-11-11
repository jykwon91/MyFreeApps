export interface DocumentsListHeaderProps {
  /** A refresh failed, so the list is what was last loaded. */
  isStale: boolean;
  /** As the type button says it, such as "All types". */
  kindLabel: string;
  onUpload: () => void;
  onWrite: () => void;
  onChooseKind: () => void;
}
