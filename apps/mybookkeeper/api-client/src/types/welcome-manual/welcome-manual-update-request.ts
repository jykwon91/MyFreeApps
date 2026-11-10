/**
 * Body for PUT /welcome-manuals/{id}. All fields optional — only dirty fields
 * are sent. An explicit ``null`` property_id un-tags the manual.
 */
export interface WelcomeManualUpdateRequest {
  title?: string;
  intro_text?: string | null;
  property_id?: string | null;
}
