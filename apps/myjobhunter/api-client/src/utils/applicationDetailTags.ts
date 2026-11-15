const APPLICATIONS_TAG = "Applications";

/** The cache tags of the application details behind these ids; empty and missing ids are skipped. */
export function applicationDetailTags(...applicationIds: (string | null | undefined)[]) {
  return [...new Set(applicationIds)]
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ type: APPLICATIONS_TAG, id }) as const);
}
