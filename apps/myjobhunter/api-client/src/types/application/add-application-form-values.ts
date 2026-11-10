import type { RemoteType } from "./remote-type";

/** What the person reviews and edits before an application is added. */
export interface AddApplicationFormValues {
  role_title: string;
  location: string;
  remote_type: RemoteType;
  notes: string;
}
