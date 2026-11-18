import type { LostCreateCopy } from "@myjobhunter/api-client/types/write/lost-create-copy";

/** What an add says when it fails. */
export interface CreateFailureCopy extends LostCreateCopy {
  /** When the thing it was being added to has been deleted (a 404). Without it, a 404 says `failed`. */
  gone?: string;
}
