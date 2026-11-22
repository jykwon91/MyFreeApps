export interface AppVersionProps {
  /** The server build to show beside this phone's own; leave out when the server has none to show. */
  serverCommit?: string;
  /** True while the server build is being fetched, so its place is held and the layout doesn't shift. */
  isServerLoading?: boolean;
}
