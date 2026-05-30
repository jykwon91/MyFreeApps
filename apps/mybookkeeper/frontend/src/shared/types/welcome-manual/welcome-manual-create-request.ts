/**
 * Body for POST /welcome-manuals. ``organization_id``/``user_id`` are resolved
 * server-side. ``seed_default_sections`` defaults to true on the backend, but
 * the create dialog always sends it explicitly.
 */
export interface WelcomeManualCreateRequest {
  title: string;
  intro_text?: string | null;
  property_id?: string | null;
  seed_default_sections: boolean;
}
