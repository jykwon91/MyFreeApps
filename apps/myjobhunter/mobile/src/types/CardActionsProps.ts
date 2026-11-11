export interface CardActionsProps {
  /** What the buttons act on, such as "Acme Corp", so screen readers can tell cards apart. */
  subject: string;
  onEdit: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}
