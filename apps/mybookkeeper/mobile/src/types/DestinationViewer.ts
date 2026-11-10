/** What the person looking at the All screen is allowed to do. */
export interface DestinationViewer {
  isAdmin: boolean;
  canWrite: boolean;
}
