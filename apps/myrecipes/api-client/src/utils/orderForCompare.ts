import type { ComparableVersion } from "../types/recipe/comparable-version";
import type { CompareTarget } from "../types/recipe/compare-target";

/** Two picked versions as a diff that reads forward: the newer one, against the older. */
export function orderForCompare(a: ComparableVersion, b: ComparableVersion): CompareTarget {
  return a.version_number >= b.version_number
    ? { versionId: a.id, against: b.id }
    : { versionId: b.id, against: a.id };
}
