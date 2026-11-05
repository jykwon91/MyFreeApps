export function waitingFilesMessage(count: number): string {
  const files = count === 1 ? "1 file is" : `${count} files are`;
  return `${files} saved on this phone. I'll send ${count === 1 ? "it" : "them"} to Claude once you allow it.`;
}
