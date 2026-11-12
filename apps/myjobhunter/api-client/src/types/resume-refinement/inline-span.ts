/** A run of one line of the draft, in bold, italic, both or neither. */
export interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
}
