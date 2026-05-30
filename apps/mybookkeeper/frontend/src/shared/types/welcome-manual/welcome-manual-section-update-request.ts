/**
 * Body for PATCH /welcome-manuals/{id}/sections/{sid}. Only dirty fields are
 * sent. An explicit ``null`` body clears it; title is required so it is never
 * sent as null.
 */
export interface WelcomeManualSectionUpdateRequest {
  title?: string;
  body?: string | null;
}
