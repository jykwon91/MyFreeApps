export interface WelcomeManualReorderItem {
  id: string;
  /** What the row is called. null for an item with no name of its own, such as a photo with no caption. */
  label: string | null;
  /** A small picture of the item. Left out for items that have none; null when the picture is missing. */
  thumbnailUri?: string | null;
}
