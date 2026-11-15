/** The two data fields of an RTK Query hook result. */
export interface ListQueryData<T> {
  /** The last answer the hook received, which may be for an earlier argument (another filter). */
  data?: T;
  /** The answer for the current argument only; undefined while it loads or after it failed. */
  currentData?: T;
}
