/** The speech fakes' recogniser as a spec drives it: it hands the app results as if words were heard. */
export interface FakeRecognizer {
  onresult: ((event: { results: ({ transcript: string }[] & { isFinal: boolean })[] }) => void) | null;
}
