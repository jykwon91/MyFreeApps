/** Mirrors ``LEASE_DOCUMENTS_LOCKED_CODE`` in ``app/core/lease_render_constants.py``. */
export const LEASE_DOCUMENTS_LOCKED_CODE = "LEASE_DOCUMENTS_LOCKED";

/** Mirrors ``LEASE_ATTACHMENT_LOCKED_CODE`` in ``app/core/lease_render_constants.py``. */
export const LEASE_ATTACHMENT_LOCKED_CODE = "LEASE_ATTACHMENT_LOCKED";

/** Mirrors ``LEASE_VALUE_LOCKED_CODE`` in ``app/core/lease_render_constants.py``. */
export const LEASE_VALUE_LOCKED_CODE = "LEASE_VALUE_LOCKED";

/** What to tell the person when the server refuses to make a sent, emailed or signed lease's documents again. */
export const LEASE_DOCUMENTS_LOCKED_MESSAGE =
  "This lease has been sent or signed, so its documents can no longer be regenerated. You can still add new documents.";

/** What to tell the person when a value the lease already holds would have changed. */
export const LEASE_VALUE_LOCKED_MESSAGE =
  "Some of those values are already on a sent, emailed or signed lease and can't be changed.";

/** What to tell the person when the server refuses to change a sent or signed lease's original or signed files. */
export const LEASE_ATTACHMENT_LOCKED_MESSAGE =
  "This lease has been sent or signed, so its original and signed documents can't be deleted or relabelled.";

/** Under a template already on a lease whose documents can no longer be made again. */
export const LEASE_DOCUMENTS_LOCKED_NOTE = "Already on this lease. It can't be made again once the lease is sent, emailed or signed.";

/** Under a field whose value is already on a sent or signed lease. */
export const LEASE_VALUE_READ_ONLY_NOTE = "Already on the lease. It can't change once the lease is sent, emailed or signed.";

/** Why the delete and relabel actions are unavailable on an original or signed file. */
export const LEASE_RECORD_FILE_LOCKED_NOTE = "Original and signed files can't be changed once the lease is sent, emailed or signed.";

