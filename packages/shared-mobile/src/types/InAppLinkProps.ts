export interface InAppLinkProps {
  label: string;
  /** Opens another screen of the app. For a page of the website, use WebLink. */
  onPress: () => void;
}
