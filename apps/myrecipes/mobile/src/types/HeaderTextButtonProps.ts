export interface HeaderTextButtonProps {
  /** What a screen reader says: the whole action. */
  label: string;
  /** What's shown, short enough to sit beside another in the header. */
  shortLabel: string;
  onPress: () => void;
}
