/** How the app-wide Gmail sync watcher behaves on one platform. */
export interface GmailSyncWatchOptions {
  /** Nothing to watch, such as no Gmail linked: the queue isn't read at all. */
  skip: boolean;
  /** False while the app can't be seen, such as a phone app in the background: nothing is re-read. */
  canPoll: boolean;
  /** Keep re-reading slowly while nothing is in flight, to notice a sync started somewhere else. */
  pollWhileIdle: boolean;
}
