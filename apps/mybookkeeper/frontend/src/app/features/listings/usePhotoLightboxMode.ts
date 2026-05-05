/**
 * Discriminated union for the lightbox's current render state.
 * Mirrors the DocumentViewMode pattern used in DocumentViewer.
 */
export type PhotoLightboxMode = "image" | "unavailable";

export interface UsePhotoLightboxModeArgs {
  presignedUrl: string | null | undefined;
}

/**
 * Resolves the lightbox's render mode from the current photo's presigned URL.
 * Separates the state-derivation logic from the rendering components.
 */
export function usePhotoLightboxMode({ presignedUrl }: UsePhotoLightboxModeArgs): PhotoLightboxMode {
  if (!presignedUrl) return "unavailable";
  return "image";
}
