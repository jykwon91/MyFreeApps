/**
 * A section image as returned by the public (unauthenticated) guide
 * endpoint — the same shape `WelcomeManualPreview` already renders
 * (presigned URL, caption, availability), minus the admin-only storage key.
 */
export interface PublicWelcomeManualSectionImage {
  id: string;
  caption: string | null;
  presigned_url: string | null;
  is_available: boolean;
  display_order: number;
}
