/**
 * Mirrors backend `WelcomeManualSectionImageResponse`. ``presigned_url`` is a
 * short-lived signed URL minted per request; ``is_available === false`` means
 * the underlying object is missing and the UI renders a placeholder.
 */
export interface WelcomeManualSectionImageResponse {
  id: string;
  section_id: string;
  storage_key: string;
  caption: string | null;
  display_order: number;
  created_at: string;
  presigned_url?: string | null;
  is_available?: boolean;
}
