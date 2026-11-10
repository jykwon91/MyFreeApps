import type { FileForUpload } from "@platform/mobile";

export interface NewLeaseTemplate {
  name: string;
  description: string;
  files: readonly FileForUpload[];
}
