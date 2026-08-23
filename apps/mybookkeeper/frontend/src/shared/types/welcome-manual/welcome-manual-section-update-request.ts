/**
 * Body for PATCH /welcome-manuals/{id}/sections/{sid}. Only dirty fields are
 * sent. An explicit ``null`` body clears it; title is required so it is never
 * sent as null.
 */
export interface WelcomeManualSectionUpdateRequest {
  title?: string;
  body?: string | null;
  /** An explicit ``null`` moves the section back to shared-by-all. */
  room_id?: string | null;
}
