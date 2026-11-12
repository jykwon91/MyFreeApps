export interface TutorBubbleProps {
  text: string;
  translation: string | null;
  /** Cut off mid-reply: the connection dropped, or the tutor failed after starting. */
  partial: boolean;
}
