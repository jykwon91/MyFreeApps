/** What a failed write shows: the message, and the form fields it's about (a 422). */
export interface TriageErrorView {
  message: string;
  fields: string[];
}
