import { SUPPORTED_EXTENSIONS } from "@/shared/lib/constants";

export function isSupportedFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export async function getFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve, reject) => (entry as FileSystemFileEntry).file(
      (f) => resolve(isSupportedFile(f.name) ? [f] : []),
      reject,
    ));
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const entries: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    entries.push(...batch);
  }
  const nested = await Promise.all(entries.map(getFilesFromEntry));
  return nested.flat();
}
