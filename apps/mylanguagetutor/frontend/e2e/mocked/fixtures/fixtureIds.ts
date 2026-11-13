/** Well-formed UUIDs that are the same on every run; the backend types every id as uuid.UUID. */
const SESSION_GROUP = 1;
const TURN_GROUP = 2;

function fixtureId(group: number, index: number): string {
  return `${group.toString(16).padStart(8, "0")}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

/** The id POST /sessions gives the nth session created during a test (from 1). */
export const sessionIdAt = (n: number): string => fixtureId(SESSION_GROUP, n);
/** The id the nth turn sent during a test (from 1) is saved under. */
export const turnIdAt = (n: number): string => fixtureId(TURN_GROUP, n);
