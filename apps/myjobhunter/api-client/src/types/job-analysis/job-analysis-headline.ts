/** The role, company and location an analysis result opens with, each filled in when Claude found none. */
export interface JobAnalysisHeadline {
  title: string;
  company: string;
  /** Null when the posting gave no location: it is left out rather than filled in. */
  location: string | null;
}
