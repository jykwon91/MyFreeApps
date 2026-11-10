import type { MoreMenuItem } from "./MoreMenuItem";

export interface MoreRowProps {
  item: MoreMenuItem;
  webBaseUrl: string;
  /** The line under the label, like the group a search result belongs to. */
  secondary?: string;
  /** Runs instead of opening the item, for results that stay on this screen. */
  onPress?: () => void;
}
