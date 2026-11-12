export interface TutorBubbleActionProps {
  label: string;
  /** What screen readers add after the label. The label stays the name, so voice control can say it. */
  hint?: string;
  /** For a show/hide toggle. */
  expanded?: boolean;
  onPress: () => void;
}
