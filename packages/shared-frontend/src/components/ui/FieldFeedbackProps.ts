export interface FieldFeedbackProps {
  /** The `id` of the control this describes; the message and counter get `${id}-error` and `${id}-counter`. */
  id: string;
  /** Announced once, when it appears. Keep it the same while the problem stays, so it isn't re-read on each keystroke. */
  error?: string;
  /** How much of a length limit is used, for example "5,100 / 5,000". Never announced: it changes with every keystroke. */
  counter?: string;
}
