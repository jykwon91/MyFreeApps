/**
 * The part of FormData an upload builder needs. A browser's FormData and React
 * Native's both fit; `Part` is what each appends for a file (a File, or a
 * `{ uri, name, type }` part).
 */
export interface MultipartForm<Part> {
  append(name: string, value: string | Part): void;
}
