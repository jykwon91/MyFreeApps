export interface TutorBubbleProps {
  text: string;
  translation: string | null;
  /** Cut off mid-reply: the connection dropped, or the tutor failed after starting. */
  partial: boolean;
  /** False while the microphone is open: the buttons stay, disabled, and say why. */
  canReplay: boolean;
  onReplay: () => void;
  onReplaySlow: () => void;
}
