/** What a confirmed removal says along the way. */
export interface RemovalMessages {
  removeTitle: string;
  removeBody: string;
  remove: string;
  keep: string;
  removed: string;
  /** Said when it was already gone (a 404). Defaults to `removed`: what was asked for is done. */
  gone?: string;
  couldntRemove: string;
}
