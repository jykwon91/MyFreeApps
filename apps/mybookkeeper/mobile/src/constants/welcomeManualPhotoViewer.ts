export const WELCOME_MANUAL_PHOTO_VIEWER_MESSAGES = {
  close: "Close photo viewer",
  previous: "Previous photo",
  next: "Next photo",
  noCaption: "No caption",
  unavailable: "This photo is missing from storage.",
} as const;

export const WELCOME_MANUAL_PHOTO_VIEWER_GLYPHS = {
  close: "✕",
  previous: "‹",
  next: "›",
} as const;

export const WELCOME_MANUAL_PHOTO_VIEWER_STYLE = {
  backdrop: "#000000",
  overlay: "rgba(0, 0, 0, 0.6)",
  onBackdrop: "#ffffff",
  mutedOnBackdrop: "#d4d4d4",
  touchTarget: 44,
  glyphSize: 28,
} as const;

export function photoViewerCounter(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}

export function photoViewerPageLabel(index: number, total: number, caption: string | null): string {
  const position = `Photo ${index + 1} of ${total}`;
  return caption ? `${position}, ${caption}` : position;
}

/** The page a horizontal scroll has settled on, kept inside the photos there are. */
export function pageAtOffset(offsetX: number, pageWidth: number, total: number): number {
  if (pageWidth <= 0 || total <= 0) return 0;
  return Math.min(Math.max(Math.round(offsetX / pageWidth), 0), total - 1);
}
