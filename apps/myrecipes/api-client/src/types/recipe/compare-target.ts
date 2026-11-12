/** A diff to open from two picked versions: the newer one, against the older. */
export interface CompareTarget {
  versionId: string;
  against: string;
}
