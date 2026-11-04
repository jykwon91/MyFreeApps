/** Just enough of expo-file-system, kept in memory. */
const files = new Set<string>();

export function resetFakeFiles(paths: string[] = []): void {
  files.clear();
  paths.forEach((path) => files.add(path));
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
  move(destination: File): void {
    if (!files.delete(this.uri)) throw new Error(`no such file: ${this.uri}`);
    files.add(destination.uri);
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
