export interface CatalogCardProps {
  title: string;
  detail: string;
  /** Before the title, such as a scenario's place in the path. */
  prefix?: string;
  /** "link" when it opens the website. */
  accessibilityRole: "button" | "link";
  accessibilityHint?: string;
  onPress: () => void;
}
