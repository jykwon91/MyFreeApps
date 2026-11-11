export interface ResearchTextBlockProps {
  label: string;
  text: string;
  /** Set apart with an accent, for the part that's about the reader. */
  isHighlighted?: boolean;
  /** Quieter text, as the website shows the culture and compensation signals. */
  isMuted?: boolean;
}
