/** Just enough of expo-file-system, kept in memory. */
const files = new Set<string>();
const contents = new Map<string, string>();
const downloads: string[] = [];
const sizes = new Map<string, number>();

export function resetFakeFiles(paths: string[] = []): void {
  files.clear();
  sizes.clear();
  downloads.length = 0;
  paths.forEach((path) => files.add(path));
}

export function setFakeFileSize(uri: string, bytes: number): void {
  sizes.set(uri, bytes);
}

export function fakeDownloads(): string[] {
  return [...downloads];
}

export function fakeFiles(): string[] {
  return [...files];
}

export const Paths = { document: "doc:", cache: "cache:" };

function joined(parent: string | Directory, name?: string): string {
  const base = typeof parent === "string" ? parent : parent.uri;
  return name === undefined ? base : `${base}/${name}`;
}

export class File {
  static async downloadFileAsync(url: string, destination: File): Promise<File> {
    downloads.push(url);
    files.add(destination.uri);
    return destination;
  }

  uri: string;
  constructor(parent: string | Directory, name?: string) {
    this.uri = joined(parent, name);
  }
  get name(): string {
    return this.uri.split("/").pop() ?? "";
  }
  get exists(): boolean {
    return files.has(this.uri);
  }
  /** Zero unless a test says otherwise with setFakeFileSize. */
  get size(): number {
    return sizes.get(this.uri) ?? 0;
  }
  move(destination: File): void {
    if (!files.delete(this.uri)) throw new Error(`no such file: ${this.uri}`);
    files.add(destination.uri);
    const size = sizes.get(this.uri);
    if (size !== undefined) sizes.set(destination.uri, size);
  }
  create(): void {
    files.add(this.uri);
  }
  write(text: string): void {
    files.add(this.uri);
    contents.set(this.uri, text);
  }
  textSync(): string {
    if (!files.has(this.uri)) throw new Error(`no such file: ${this.uri}`);
    return contents.get(this.uri) ?? "";
  }
  /** Throws on a missing file, like the real one. */
  delete(): void {
    if (!files.delete(this.uri)) throw new Error(`no such file: ${this.uri}`);
  }
}

export class Directory {
  uri: string;
  constructor(parent: string | Directory, name?: string) {
    this.uri = joined(parent, name);
  }
  create(): void {}
  get exists(): boolean {
    return [...files].some((path) => path.startsWith(`${this.uri}/`));
  }
  list(): File[] {
    return [...files].filter((path) => path.startsWith(`${this.uri}/`)).map((path) => new File(path));
  }
  delete(): void {
    [...files].filter((path) => path.startsWith(`${this.uri}/`)).forEach((path) => files.delete(path));
  }
}
