export const LISTING_LINK_MESSAGES = {
  heading: "Other sites",
  noneHeading: "Not linked anywhere yet.",
  noneBody: "Link this listing to where it's posted, like Furnished Finder or Airbnb.",
  noneViewOnlyBody: "Someone with edit access can add links.",
  add: "Add a link",
  openLink: "Open link",
  edit: "Edit",
  remove: "Remove",
  removing: "Removing…",
  removed: "Link removed.",
  alreadyRemoved: "That link was already removed.",
  removeBody: "This only removes the link here. The listing on that site isn't touched.",
  idLabel: "ID",
  newTitle: "Add a link",
  editTitle: "Edit link",
  source: "Site",
  chooseSource: "Which site is it on?",
  externalId: "ID on the site",
  externalUrl: "Link to the listing",
  urlHint: "Starts with https://",
  allLinked: "This listing is already linked to every site I know.",
  addSubmit: "Add link",
  adding: "Adding…",
  save: "Save changes",
  saving: "Saving…",
  added: "Link added.",
  saved: "Link saved.",
  conflict: "That site is already linked to this listing, or another listing already uses that ID.",
} as const;

export function removeLinkTitle(source: string): string {
  return `Remove the ${source} link?`;
}
