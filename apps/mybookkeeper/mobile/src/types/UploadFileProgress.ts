import type { UploadFileStatus } from "./UploadFileStatus";

/** One file on its way to the server, as the person sees it. */
export interface UploadFileProgress {
  /** Where it waits on the phone, which is what tells two files of the same name apart. */
  uri: string;
  name: string;
  status: UploadFileStatus;
  /** How much has gone out, 0 to 100, once the phone can tell. */
  percent: number | null;
}
