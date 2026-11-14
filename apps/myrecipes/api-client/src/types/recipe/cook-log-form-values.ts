/** A cook as it's being logged: a 1-5 rating, or none yet, and notes as typed ("" when blank). */
export interface CookLogFormValues {
  rating: number | null;
  notes: string;
}
