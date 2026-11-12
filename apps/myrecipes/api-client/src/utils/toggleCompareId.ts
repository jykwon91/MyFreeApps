import { COMPARE_VERSION_COUNT } from "../constants/versions";

/** Picks or unpicks a version to compare. Once two are picked, another can't be until one is unpicked. */
export function toggleCompareId(picked: readonly string[], versionId: string): string[] {
  if (picked.includes(versionId)) return picked.filter((id) => id !== versionId);
  if (picked.length >= COMPARE_VERSION_COUNT) return [...picked];
  return [...picked, versionId];
}
