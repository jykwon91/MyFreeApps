/** What every reading of a document says about itself, whatever it was read into. */
export interface ReadDocumentDraft {
  confidence: string;
  warnings: string[];
  unrepresented: string[];
  notes: string | null;
}
