/** The notice above the list when something couldn't be read. `firstName` is used when it is the only one. */
export function failedDocumentsMessage(count: number, firstName: string): string {
  return count === 1
    ? `I had trouble with ${firstName}. Want me to try again?`
    : `I had trouble with ${count} documents. Want to take a look?`;
}
