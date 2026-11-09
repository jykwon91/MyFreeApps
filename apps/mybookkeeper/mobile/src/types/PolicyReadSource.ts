import type { FileForUpload } from "./FileForUpload";

/** What a policy is being read from: a file picked on the phone, or a document already uploaded. */
export type PolicyReadSource = { kind: "file"; file: FileForUpload } | { kind: "document"; id: string; name: string };
