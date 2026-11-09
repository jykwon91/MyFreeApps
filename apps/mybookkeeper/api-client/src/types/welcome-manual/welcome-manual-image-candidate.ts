/** The bits of a picked file the upload gate looks at; satisfied by a web File and a phone held file. */
export interface WelcomeManualImageCandidate {
  name: string;
  size?: number | null;
  type?: string | null;
}
