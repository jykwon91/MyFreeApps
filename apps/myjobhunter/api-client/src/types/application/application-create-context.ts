/** What the add flow knows beyond the form: the company, and where the posting came from. */
export interface ApplicationCreateContext {
  companyId: string;
  sourceUrl: string | null;
  /** The pasted job description, when the posting came from text. */
  jdText: string;
}
