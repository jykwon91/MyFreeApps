import type { FileForUpload } from "./FileForUpload";

export interface NewLeaseTemplate {
  name: string;
  description: string;
  files: readonly FileForUpload[];
}
